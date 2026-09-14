import logging
import uuid

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import MindGuardUser
from .serializers import (
    AuthLoginSerializer,
    AuthRegisterSerializer,
    MoodEntrySerializer,
    MoodLogSerializer,
    NotificationSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    TextInteractionSerializer,
    TokenRegistrationSerializer,
    VideoInteractionSerializer,
    VoiceInteractionSerializer,
)
from .services import (
    analyze_audio,
    analyze_text,
    analyze_video,
    create_mood_log,
    format_burnout_snapshot,
    get_user_logs,
    serialize_user,
)

logger = logging.getLogger(__name__)

AUTH_SALT = "mindguard-auth"
REFRESH_SALT = "mindguard-refresh"
VERIFY_SALT = "mindguard-verify"
RESET_SALT = "mindguard-reset"


def _create_signed_token(payload, salt):
    return signing.dumps(payload, salt=salt)


def _load_signed_token(token, salt, max_age):
    return signing.loads(token, salt=salt, max_age=max_age)


def _find_user_by_identifier(user_id):
    if not user_id:
        return None
    try:
        return MindGuardUser.objects.filter(external_id=uuid.UUID(str(user_id))).first()
    except (ValueError, TypeError):
        return MindGuardUser.objects.filter(email__iexact=user_id).first()


def _extract_bearer_token(request):
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return ""


def _authenticated_user(request):
    token = _extract_bearer_token(request)
    if not token:
        return None

    try:
        payload = _load_signed_token(token, AUTH_SALT, settings.AUTH_TOKEN_TTL_SECONDS)
    except signing.BadSignature:
        return None

    if payload.get("kind") != "access":
        return None

    return MindGuardUser.objects.filter(external_id=payload.get("uid")).first()


def _issue_auth_payload(user):
    auth_token = _create_signed_token({"uid": str(user.external_id), "kind": "access"}, AUTH_SALT)
    refresh_token = _create_signed_token({"uid": str(user.external_id), "kind": "refresh"}, REFRESH_SALT)
    return {
        "authToken": auth_token,
        "refreshToken": refresh_token,
        "user": serialize_user(user),
        "burnoutSnapshot": format_burnout_snapshot(get_user_logs(str(user.external_id))),
    }


def _resolve_actor(request, explicit_user_id=None, require_auth=False):
    auth_user = _authenticated_user(request)
    explicit_user = _find_user_by_identifier(explicit_user_id) if explicit_user_id else None

    if require_auth and not auth_user:
        return None, None, Response(
            {"message": "Authentication required"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if auth_user and explicit_user_id:
        allowed_ids = {str(auth_user.external_id), auth_user.email.lower()}
        if str(explicit_user_id).lower() not in {item.lower() for item in allowed_ids}:
            return None, None, Response(
                {"message": "You can only access your own data"},
                status=status.HTTP_403_FORBIDDEN,
            )

    if auth_user:
        return str(auth_user.external_id), auth_user, None
    if explicit_user:
        return str(explicit_user.external_id), explicit_user, None
    if explicit_user_id:
        return str(explicit_user_id), None, None
    return None, None, None


def _send_account_email(subject, message, recipient):
    """Sends transactional mail and reports whether it actually left.

    Returns (sent, error). Callers use this to tell the user something
    actionable instead of leaving them with an account they cannot verify.
    """
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=settings.EMAIL_FAIL_SILENTLY,
        )
        return True, None
    except Exception as error:  # noqa: BLE001 - surfaced to the caller below
        logger.exception("Failed to send %r to %s", subject, recipient)
        return False, str(error)


def _build_named_user(validated_data):
    first_name = validated_data["firstName"].strip()
    last_name = validated_data["lastName"].strip()
    return {
        "first_name": first_name,
        "last_name": last_name,
        "name": " ".join(part for part in [first_name, last_name] if part).strip(),
    }


@api_view(["GET"])
def health_view(request):
    return Response(
        {
            "status": "ok",
            "service": "mindguard-django-api",
            "version": "1.1.0",
        }
    )


@api_view(["POST"])
def register_view(request):
    serializer = AuthRegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"].lower()

    if MindGuardUser.objects.filter(email=email).exists():
        return Response(
            {"message": "User already exists"},
            status=status.HTTP_409_CONFLICT,
        )

    user = MindGuardUser.objects.create(
        email=email,
        **_build_named_user(serializer.validated_data),
        password_hash=make_password(serializer.validated_data["password"]),
        is_verified=settings.DEMO_AUTO_VERIFY,
    )
    token = _create_signed_token({"uid": str(user.external_id)}, VERIFY_SALT)
    verification_url = f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={token}"

    if settings.DEMO_AUTO_VERIFY:
        return Response(
            {
                "message": "Account created and ready to use. You can log in now.",
                "autoVerified": True,
            },
            status=status.HTTP_201_CREATED,
        )

    sent, error = _send_account_email(
        "Verify your MindGuard account",
        (
            "Welcome to MindGuard.\n\n"
            f"Verify your account here: {verification_url}\n\n"
            "If you did not request this account, you can ignore this email."
        ),
        user.email,
    )

    payload = {"message": "Account created. Check your email for the verification link."}
    if settings.DEBUG:
        payload["verificationUrl"] = verification_url

    if not sent:
        # The account exists but is unreachable by email. Say so plainly rather
        # than reporting success and leaving the user unable to ever log in.
        payload["message"] = (
            "Account created, but the verification email could not be sent. "
            "Contact support to activate it."
        )
        payload["emailDelivered"] = False
        if settings.DEBUG:
            payload["emailError"] = error

    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def verify_view(request):
    token = request.query_params.get("token")
    if not token:
        return Response({"message": "Invalid token"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        payload = _load_signed_token(token, VERIFY_SALT, 60 * 60 * 24)
    except signing.BadSignature:
        return Response({"message": "Invalid or expired token"}, status=status.HTTP_400_BAD_REQUEST)

    user = MindGuardUser.objects.filter(external_id=payload.get("uid")).first()
    if not user:
        return Response({"message": "User not found"}, status=status.HTTP_404_NOT_FOUND)
    if user.is_verified:
        return Response({"message": "Email already verified"})

    user.is_verified = True
    user.save(update_fields=["is_verified", "updated_at"])
    return Response({"message": "Email successfully verified. You may now log in."})


@api_view(["POST"])
def login_view(request):
    serializer = AuthLoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user = MindGuardUser.objects.filter(email=serializer.validated_data["email"].lower()).first()
    if not user or not check_password(serializer.validated_data["password"], user.password_hash):
        return Response(
            {"message": "Invalid credentials"},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    if not user.is_verified:
        return Response(
            {"message": "Please verify your email first"},
            status=status.HTTP_403_FORBIDDEN,
        )

    user.last_login_at = timezone.now()
    user.save(update_fields=["last_login_at", "updated_at"])
    return Response(_issue_auth_payload(user))


@api_view(["GET"])
def me_view(request):
    user = _authenticated_user(request)
    if not user:
        return Response({"message": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
    return Response({"user": serialize_user(user), "burnoutSnapshot": format_burnout_snapshot(get_user_logs(str(user.external_id)))})


@api_view(["POST"])
def logout_view(request):
    return Response({"message": "Logged out. Clear the local session on the client."})


@api_view(["POST"])
def password_reset_request_view(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    email = serializer.validated_data["email"].lower()
    user = MindGuardUser.objects.filter(email=email).first()
    payload = {"message": "If that email exists, a reset link has been sent."}

    if user:
        token = _create_signed_token({"uid": str(user.external_id)}, RESET_SALT)
        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
        _send_account_email(
            "Reset your MindGuard password",
            (
                "A password reset was requested for your MindGuard account.\n\n"
                f"Reset it here: {reset_url}\n\n"
                "If you did not request this change, you can ignore this email."
            ),
            user.email,
        )
        if settings.DEBUG:
            payload["resetUrl"] = reset_url

    return Response(payload)


@api_view(["POST"])
def password_reset_confirm_view(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        payload = _load_signed_token(
            serializer.validated_data["token"],
            RESET_SALT,
            settings.PASSWORD_RESET_TOKEN_TTL_SECONDS,
        )
    except signing.BadSignature:
        return Response({"message": "Invalid or expired token"}, status=status.HTTP_400_BAD_REQUEST)

    user = MindGuardUser.objects.filter(external_id=payload.get("uid")).first()
    if not user:
        return Response({"message": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    user.password_hash = make_password(serializer.validated_data["password"])
    user.save(update_fields=["password_hash", "updated_at"])
    return Response({"message": "Password updated. You can now log in."})


def _interaction_response(user_id, source_mode, analysis, user=None):
    mood_log = create_mood_log(
        user_id=user_id,
        source_mode=source_mode,
        analysis=analysis,
        user=user,
    )
    snapshot = format_burnout_snapshot(get_user_logs(user_id))
    return mood_log, snapshot


@api_view(["POST"])
def text_interaction_view(request):
    serializer = TextInteractionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user_id, user, auth_error = _resolve_actor(
        request, serializer.validated_data.get("userId"), require_auth=True
    )
    if auth_error:
        return auth_error

    analysis = analyze_text(serializer.validated_data["text"])
    mood_log, snapshot = _interaction_response(user_id, "text", analysis, user=user)
    return Response({"message": "Text processed", "moodLog": MoodLogSerializer(mood_log).data, "burnoutRisk": snapshot})


@api_view(["POST"])
def voice_interaction_view(request):
    serializer = VoiceInteractionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user_id, user, auth_error = _resolve_actor(
        request, serializer.validated_data.get("userId"), require_auth=True
    )
    if auth_error:
        return auth_error

    analysis = analyze_audio(
        audio_base64=serializer.validated_data.get("audioBase64", ""),
        transcript=serializer.validated_data.get("transcript", ""),
        voice_features=serializer.validated_data.get("voiceFeatures"),
    )
    mood_log, snapshot = _interaction_response(user_id, "voice", analysis, user=user)
    return Response({"message": "Voice processed", "moodLog": MoodLogSerializer(mood_log).data, "burnoutRisk": snapshot})


@api_view(["POST"])
def video_interaction_view(request):
    serializer = VideoInteractionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user_id, user, auth_error = _resolve_actor(
        request, serializer.validated_data.get("userId"), require_auth=True
    )
    if auth_error:
        return auth_error

    analysis = analyze_video(
        video_base64=serializer.validated_data.get("videoBase64", ""),
        facial_signals=serializer.validated_data.get("facialSignals"),
    )
    mood_log, snapshot = _interaction_response(user_id, "video", analysis, user=user)
    return Response({"message": "Video processed", "moodLog": MoodLogSerializer(mood_log).data, "burnoutRisk": snapshot})


@api_view(["GET", "POST"])
def mood_view(request):
    if request.method == "POST":
        serializer = MoodEntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_id, user, auth_error = _resolve_actor(
            request,
            serializer.validated_data.get("userId"),
            require_auth=True,
        )
        if auth_error:
            return auth_error

        mood_log = create_mood_log(
            user_id=user_id,
            source_mode=serializer.validated_data["sourceMode"],
            analysis={
                "emotion": serializer.validated_data["emotion"],
                "confidence": serializer.validated_data.get("details", {}).get("confidence", 0.88),
                "details": {
                    **serializer.validated_data.get("details", {}),
                    "confidence": serializer.validated_data.get("details", {}).get("confidence", 0.88),
                },
            },
            user=user,
        )
        snapshot = format_burnout_snapshot(get_user_logs(user_id))
        return Response({"entry": MoodLogSerializer(mood_log).data, "burnoutRisk": snapshot})

    user_id, _, auth_error = _resolve_actor(
        request,
        request.query_params.get("userId") or request.headers.get("x-user-id"),
        require_auth=True,
    )
    if auth_error:
        return auth_error

    logs = get_user_logs(user_id)
    return Response(MoodLogSerializer(logs[:50], many=True).data)


@api_view(["GET"])
def mood_history_view(request):
    user_id, _, auth_error = _resolve_actor(request, request.query_params.get("userId"), require_auth=True)
    if auth_error:
        return auth_error

    logs = get_user_logs(user_id)
    return Response(MoodLogSerializer(logs[:30], many=True).data)


@api_view(["GET"])
def burnout_risk_view(request):
    user_id, _, auth_error = _resolve_actor(request, request.query_params.get("userId"), require_auth=True)
    if auth_error:
        return auth_error

    snapshot = format_burnout_snapshot(get_user_logs(user_id))
    return Response(snapshot)


@api_view(["POST"])
def register_token_view(request):
    serializer = TokenRegistrationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user_id, user, auth_error = _resolve_actor(request, serializer.validated_data.get("userId"), require_auth=True)
    if auth_error:
        return auth_error
    if not user:
        user = _find_user_by_identifier(user_id)
    if not user:
        return Response({"message": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    user.expo_push_token = serializer.validated_data["expoPushToken"]
    user.save(update_fields=["expo_push_token", "updated_at"])
    return Response({"message": "Push token registered successfully"})


@api_view(["POST"])
def send_alert_view(request):
    serializer = NotificationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user_id, user, auth_error = _resolve_actor(request, serializer.validated_data.get("userId"), require_auth=True)
    if auth_error:
        return auth_error
    if not user:
        user = _find_user_by_identifier(user_id)
    if not user or not user.expo_push_token:
        return Response(
            {"message": "User or push token not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    ticket = {
        "id": _create_signed_token({"uid": str(user.external_id)}, "mindguard-ticket"),
        "status": "queued",
        "title": serializer.validated_data["title"],
    }
    return Response({"message": "Notification sent", "tickets": [ticket]})
