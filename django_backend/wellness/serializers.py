from rest_framework import serializers

from .models import MoodLog


class AuthRegisterSerializer(serializers.Serializer):
    firstName = serializers.CharField(max_length=60)
    lastName = serializers.CharField(max_length=60)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, max_length=128)
    passwordConfirm = serializers.CharField(min_length=8, max_length=128)
    agreeToTerms = serializers.BooleanField()

    def validate(self, attrs):
        if attrs["password"] != attrs["passwordConfirm"]:
            raise serializers.ValidationError({"passwordConfirm": "Passwords do not match"})
        if not attrs["agreeToTerms"]:
            raise serializers.ValidationError({"agreeToTerms": "You must agree before creating an account"})
        return attrs


class AuthLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, max_length=128)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(min_length=8, max_length=128)
    passwordConfirm = serializers.CharField(min_length=8, max_length=128)

    def validate(self, attrs):
        if attrs["password"] != attrs["passwordConfirm"]:
            raise serializers.ValidationError({"passwordConfirm": "Passwords do not match"})
        return attrs


class MoodLogSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="entry_id", read_only=True)
    userId = serializers.CharField(source="client_user_id", read_only=True)
    sourceMode = serializers.CharField(source="source_mode", read_only=True)

    class Meta:
        model = MoodLog
        fields = ["id", "userId", "timestamp", "emotion", "sourceMode", "details"]


class MoodEntrySerializer(serializers.Serializer):
    userId = serializers.CharField(max_length=64, required=False, allow_blank=True)
    emotion = serializers.CharField(max_length=32)
    sourceMode = serializers.ChoiceField(choices=[choice[0] for choice in MoodLog.SOURCE_CHOICES])
    details = serializers.JSONField(required=False)


class TextInteractionSerializer(serializers.Serializer):
    userId = serializers.CharField(max_length=64, required=False, allow_blank=True)
    text = serializers.CharField(max_length=5000, allow_blank=False, trim_whitespace=True)


class CompanionReplySerializer(serializers.Serializer):
    """Validates a reply request. `context` and `analysis` are client-supplied
    and therefore untrusted — they only shape wording, never authorisation."""

    text = serializers.CharField(max_length=4000, trim_whitespace=True)
    context = serializers.JSONField(required=False)
    analysis = serializers.JSONField(required=False)
    history = serializers.JSONField(required=False)

    def validate_history(self, value):
        if not value:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("history must be a list.")
        # Cap the window so a client cannot drive up token cost arbitrarily.
        return [
            {"role": str(turn.get("role", "user"))[:16], "text": str(turn.get("text", ""))[:1000]}
            for turn in value[-8:]
            if isinstance(turn, dict)
        ]

    def validate_context(self, value):
        return value if isinstance(value, dict) else {}

    def validate_analysis(self, value):
        return value if isinstance(value, dict) else {}


class VoiceInteractionSerializer(serializers.Serializer):
    """A voice check-in needs at least one channel carrying real information."""

    userId = serializers.CharField(max_length=64, required=False, allow_blank=True)
    audioBase64 = serializers.CharField(required=False, allow_blank=True)
    transcript = serializers.CharField(max_length=5000, required=False, allow_blank=True)
    voiceFeatures = serializers.JSONField(required=False)

    def validate_voiceFeatures(self, value):
        return _validate_signal_map(value, "voiceFeatures")

    def validate(self, attrs):
        if not any(
            [
                (attrs.get("transcript") or "").strip(),
                (attrs.get("audioBase64") or "").strip(),
                attrs.get("voiceFeatures"),
            ]
        ):
            raise serializers.ValidationError(
                {"transcript": "Provide a transcript, voice features, or audio to analyse."}
            )
        return attrs


class VideoInteractionSerializer(serializers.Serializer):
    userId = serializers.CharField(max_length=64, required=False, allow_blank=True)
    videoBase64 = serializers.CharField(required=False, allow_blank=True)
    facialSignals = serializers.JSONField(required=False)

    def validate_facialSignals(self, value):
        return _validate_signal_map(value, "facialSignals", allow_text_keys=("emotion",))

    def validate(self, attrs):
        if not (attrs.get("facialSignals") or (attrs.get("videoBase64") or "").strip()):
            raise serializers.ValidationError(
                {"facialSignals": "Provide facial signals or a video frame to analyse."}
            )
        return attrs


def _validate_signal_map(value, field_name, allow_text_keys=()):
    """Signal maps must be flat dictionaries of numbers (plus named text keys)."""
    if value in (None, ""):
        return {}
    if not isinstance(value, dict):
        raise serializers.ValidationError(f"{field_name} must be an object.")
    if len(value) > 20:
        raise serializers.ValidationError(f"{field_name} has too many entries.")

    for key, entry in value.items():
        if key in allow_text_keys:
            if not isinstance(entry, str):
                raise serializers.ValidationError(f"{field_name}.{key} must be a string.")
            continue
        if isinstance(entry, bool) or not isinstance(entry, (int, float)):
            raise serializers.ValidationError(f"{field_name}.{key} must be a number.")

    return value


class TokenRegistrationSerializer(serializers.Serializer):
    userId = serializers.CharField(max_length=64, required=False, allow_blank=True)
    expoPushToken = serializers.CharField(max_length=255)


class NotificationSerializer(serializers.Serializer):
    userId = serializers.CharField(max_length=64, required=False, allow_blank=True)
    title = serializers.CharField(max_length=120)
    body = serializers.CharField(max_length=500)
    data = serializers.JSONField(required=False)
