import json
from smtplib import SMTPAuthenticationError
from unittest import mock

from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import MindGuardUser, MoodLog


@override_settings(DEBUG=True, FRONTEND_URL="http://127.0.0.1:5173")
class WellnessApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _register_payload(self, email="user@example.com"):
        return {
            "firstName": "Test",
            "lastName": "User",
            "email": email,
            "password": "strongpass123",
            "passwordConfirm": "strongpass123",
            "agreeToTerms": True,
        }

    def _verify_and_login(self, email="user@example.com"):
        register_response = self.client.post(
            "/api/auth/register",
            self._register_payload(email=email),
            format="json",
        )
        verify_response = self.client.get(
            "/api/auth/verify",
            {"token": register_response.json()["verificationUrl"].split("token=")[-1]},
        )
        self.assertEqual(verify_response.status_code, 200)

        login_response = self.client.post(
            "/api/auth/login",
            {"email": email, "password": "strongpass123"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        token = login_response.json()["authToken"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return login_response.json()

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_register_login_verify_flow(self):
        register_response = self.client.post(
            "/api/auth/register",
            self._register_payload(),
            format="json",
        )
        self.assertEqual(register_response.status_code, 201)
        self.assertIn("verificationUrl", register_response.json())

        verify_response = self.client.get(
            "/api/auth/verify",
            {"token": register_response.json()["verificationUrl"].split("token=")[-1]},
        )
        self.assertEqual(verify_response.status_code, 200)

        login_response = self.client.post(
            "/api/auth/login",
            {"email": "user@example.com", "password": "strongpass123"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        self.assertIn("authToken", login_response.json())
        self.assertEqual(login_response.json()["user"]["firstName"], "Test")

        self.assertTrue(MindGuardUser.objects.get(email="user@example.com").is_verified)

    def test_register_requires_terms_and_matching_passwords(self):
        response = self.client.post(
            "/api/auth/register",
            {
                **self._register_payload(),
                "agreeToTerms": False,
                "passwordConfirm": "differentpass123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_login_rejects_unverified_account(self):
        self.client.post("/api/auth/register", self._register_payload(), format="json")
        response = self.client.post(
            "/api/auth/login",
            {"email": "user@example.com", "password": "strongpass123"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_me_requires_authentication(self):
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 401)

    def test_password_reset_flow(self):
        register_response = self.client.post("/api/auth/register", self._register_payload(), format="json")
        reset_request = self.client.post(
            "/api/auth/password-reset/request",
            {"email": "user@example.com"},
            format="json",
        )
        self.assertEqual(reset_request.status_code, 200)
        self.assertIn("resetUrl", reset_request.json())

        reset_confirm = self.client.post(
            "/api/auth/password-reset/confirm",
            {
                "token": reset_request.json()["resetUrl"].split("token=")[-1],
                "password": "newpass456",
                "passwordConfirm": "newpass456",
            },
            format="json",
        )
        self.assertEqual(reset_confirm.status_code, 200)

        verify_response = self.client.get(
            "/api/auth/verify",
            {"token": register_response.json()["verificationUrl"].split("token=")[-1]},
        )
        self.assertEqual(verify_response.status_code, 200)

        login_response = self.client.post(
            "/api/auth/login",
            {"email": "user@example.com", "password": "newpass456"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)

    def test_text_interaction_creates_log_for_authenticated_user(self):
        session = self._verify_and_login()
        response = self.client.post(
            "/api/interactions/text",
            {"text": "I feel stressed after back-to-back deadlines"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["moodLog"]["emotion"], "stressed")
        self.assertEqual(response.json()["moodLog"]["userId"], session["user"]["id"])

    def test_burnout_risk_uses_history(self):
        self._verify_and_login()
        self.client.post(
            "/api/interactions/text",
            {"text": "I feel stressed today"},
            format="json",
        )
        self.client.post(
            "/api/interactions/text",
            {"text": "I still feel overwhelmed"},
            format="json",
        )
        response = self.client.get("/api/mood/burnout-risk")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.json()["burnoutRisk"], 70)

    def test_cannot_read_another_users_history(self):
        self._verify_and_login()
        other = MindGuardUser.objects.create(
            email="other@example.com",
            first_name="Other",
            last_name="User",
            name="Other User",
            password_hash="noop",
            is_verified=True,
        )
        response = self.client.get(f"/api/mood/history?userId={other.external_id}")
        self.assertEqual(response.status_code, 403)

    def test_notification_flow_supports_registered_push_token(self):
        self._verify_and_login()
        register_response = self.client.post(
            "/api/notifications/register-token",
            {"expoPushToken": "ExponentPushToken[sample]"},
            format="json",
        )
        self.assertEqual(register_response.status_code, 200)

        alert_response = self.client.post(
            "/api/notifications/send-alert",
            {"title": "Take a breath", "body": "Step away for two minutes."},
            format="json",
        )
        self.assertEqual(alert_response.status_code, 200)
        self.assertEqual(alert_response.json()["tickets"][0]["status"], "queued")

    def test_invalid_mood_source_mode_is_rejected(self):
        self._verify_and_login()
        response = self.client.post(
            "/api/mood",
            {"emotion": "calm", "sourceMode": "invalid-mode"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)


@override_settings(DEBUG=True, FRONTEND_URL="http://127.0.0.1:5173", OPENAI_API_KEY="")
class AuthFailureTests(TestCase):
    """Covers the ways authentication is expected to be refused."""

    def setUp(self):
        self.client = APIClient()
        self.client.post(
            "/api/auth/register",
            {
                "firstName": "Ada",
                "lastName": "Lovelace",
                "email": "ada@example.com",
                "password": "strongpass123",
                "passwordConfirm": "strongpass123",
                "agreeToTerms": True,
            },
            format="json",
        )
        user = MindGuardUser.objects.get(email="ada@example.com")
        user.is_verified = True
        user.save(update_fields=["is_verified"])
        self.user = user

    def _login(self):
        response = self.client.post(
            "/api/auth/login",
            {"email": "ada@example.com", "password": "strongpass123"},
            format="json",
        )
        return response.json()["authToken"]

    def test_login_with_wrong_password_is_rejected(self):
        response = self.client.post(
            "/api/auth/login",
            {"email": "ada@example.com", "password": "wrongpassword1"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertNotIn("authToken", response.json())

    def test_login_with_unknown_email_does_not_reveal_account_existence(self):
        response = self.client.post(
            "/api/auth/login",
            {"email": "nobody@example.com", "password": "strongpass123"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["message"], "Invalid credentials")

    def test_duplicate_registration_is_rejected(self):
        response = self.client.post(
            "/api/auth/register",
            {
                "firstName": "Ada",
                "lastName": "Lovelace",
                "email": "ada@example.com",
                "password": "strongpass123",
                "passwordConfirm": "strongpass123",
                "agreeToTerms": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 409)

    def test_registration_rejects_short_password(self):
        response = self.client.post(
            "/api/auth/register",
            {
                "firstName": "Bob",
                "lastName": "Short",
                "email": "bob@example.com",
                "password": "tiny",
                "passwordConfirm": "tiny",
                "agreeToTerms": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(MindGuardUser.objects.filter(email="bob@example.com").exists())

    def test_garbage_bearer_token_is_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

    def test_tampered_bearer_token_is_rejected(self):
        token = self._login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}x")
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

    def test_refresh_token_cannot_be_used_as_an_access_token(self):
        login = self.client.post(
            "/api/auth/login",
            {"email": "ada@example.com", "password": "strongpass123"},
            format="json",
        ).json()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['refreshToken']}")
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

    def test_malformed_authorization_header_is_ignored(self):
        self.client.credentials(HTTP_AUTHORIZATION="Token abc123")
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

    def test_protected_endpoints_require_authentication(self):
        for path in ("/api/mood/history", "/api/mood/burnout-risk", "/api/mood"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 401)

    def test_password_reset_for_unknown_email_does_not_leak(self):
        response = self.client.post(
            "/api/auth/password-reset/request",
            {"email": "nobody@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("resetUrl", response.json())

    def test_password_reset_rejects_tampered_token(self):
        response = self.client.post(
            "/api/auth/password-reset/confirm",
            {"token": "forged-token", "password": "newpass456", "passwordConfirm": "newpass456"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_password_reset_rejects_mismatched_passwords(self):
        reset_url = self.client.post(
            "/api/auth/password-reset/request",
            {"email": "ada@example.com"},
            format="json",
        ).json()["resetUrl"]

        response = self.client.post(
            "/api/auth/password-reset/confirm",
            {
                "token": reset_url.split("token=")[-1],
                "password": "newpass456",
                "passwordConfirm": "differentpass789",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_verify_endpoint_rejects_missing_and_invalid_tokens(self):
        self.assertEqual(self.client.get("/api/auth/verify").status_code, 400)
        self.assertEqual(self.client.get("/api/auth/verify", {"token": "bogus"}).status_code, 400)

    def test_cannot_write_a_mood_entry_as_another_user(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._login()}")
        other = MindGuardUser.objects.create(
            email="other@example.com",
            first_name="Other",
            last_name="User",
            name="Other User",
            password_hash="noop",
            is_verified=True,
        )
        response = self.client.post(
            "/api/mood",
            {"userId": str(other.external_id), "emotion": "calm", "sourceMode": "text"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(other.mood_logs.count(), 0)


@override_settings(DEBUG=True, FRONTEND_URL="http://127.0.0.1:5173", OPENAI_API_KEY="")
class NotificationFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.post(
            "/api/auth/register",
            {
                "firstName": "Grace",
                "lastName": "Hopper",
                "email": "grace@example.com",
                "password": "strongpass123",
                "passwordConfirm": "strongpass123",
                "agreeToTerms": True,
            },
            format="json",
        )
        user = MindGuardUser.objects.get(email="grace@example.com")
        user.is_verified = True
        user.save(update_fields=["is_verified"])
        self.user = user

        token = self.client.post(
            "/api/auth/login",
            {"email": "grace@example.com", "password": "strongpass123"},
            format="json",
        ).json()["authToken"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_register_token_requires_authentication(self):
        anonymous = APIClient()
        response = anonymous.post(
            "/api/notifications/register-token",
            {"expoPushToken": "ExponentPushToken[sample]"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_register_token_rejects_missing_token_field(self):
        response = self.client.post("/api/notifications/register-token", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_alert_without_registered_push_token_returns_not_found(self):
        response = self.client.post(
            "/api/notifications/send-alert",
            {"title": "Take a breath", "body": "Step away for two minutes."},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_alert_requires_title_and_body(self):
        self.client.post(
            "/api/notifications/register-token",
            {"expoPushToken": "ExponentPushToken[sample]"},
            format="json",
        )
        response = self.client.post("/api/notifications/send-alert", {"title": "Only a title"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_register_token_overwrites_previous_token(self):
        self.client.post(
            "/api/notifications/register-token",
            {"expoPushToken": "ExponentPushToken[first]"},
            format="json",
        )
        self.client.post(
            "/api/notifications/register-token",
            {"expoPushToken": "ExponentPushToken[second]"},
            format="json",
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.expo_push_token, "ExponentPushToken[second]")

    def test_cannot_send_an_alert_to_another_user(self):
        other = MindGuardUser.objects.create(
            email="target@example.com",
            password_hash="noop",
            is_verified=True,
            expo_push_token="ExponentPushToken[target]",
        )
        response = self.client.post(
            "/api/notifications/send-alert",
            {"userId": str(other.external_id), "title": "Hello", "body": "There"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)


@override_settings(DEBUG=True, FRONTEND_URL="http://127.0.0.1:5173", OPENAI_API_KEY="")
class InteractionValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.post(
            "/api/auth/register",
            {
                "firstName": "Alan",
                "lastName": "Turing",
                "email": "alan@example.com",
                "password": "strongpass123",
                "passwordConfirm": "strongpass123",
                "agreeToTerms": True,
            },
            format="json",
        )
        user = MindGuardUser.objects.get(email="alan@example.com")
        user.is_verified = True
        user.save(update_fields=["is_verified"])

        token = self.client.post(
            "/api/auth/login",
            {"email": "alan@example.com", "password": "strongpass123"},
            format="json",
        ).json()["authToken"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_text_interaction_rejects_blank_and_whitespace_only_input(self):
        for payload in ({}, {"text": ""}, {"text": "   "}):
            with self.subTest(payload=payload):
                response = self.client.post("/api/interactions/text", payload, format="json")
                self.assertEqual(response.status_code, 400)

    def test_voice_interaction_requires_at_least_one_signal(self):
        response = self.client.post("/api/interactions/voice", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_voice_interaction_uses_the_transcript_when_present(self):
        response = self.client.post(
            "/api/interactions/voice",
            {"transcript": "I am completely exhausted and drained today"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        mood_log = response.json()["moodLog"]
        self.assertEqual(mood_log["emotion"], "fatigued")
        self.assertEqual(mood_log["sourceMode"], "voice")
        # The transcript path must run through the text pipeline, not a guess.
        self.assertNotEqual(mood_log["details"]["analysisEngine"], "unscored")

    def test_voice_interaction_rejects_non_numeric_features(self):
        response = self.client.post(
            "/api/interactions/voice",
            {"transcript": "hello there", "voiceFeatures": {"energy": "loud"}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_voice_interaction_without_transcript_is_marked_unscored(self):
        response = self.client.post(
            "/api/interactions/voice",
            {"audioBase64": "AAAAAAAAAAAAAAAAAAAA"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        details = response.json()["moodLog"]["details"]
        self.assertTrue(details["unscored"])
        self.assertEqual(details["confidenceBand"], "low")

    def test_video_interaction_requires_signals_or_frame(self):
        response = self.client.post("/api/interactions/video", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_video_interaction_scores_facial_signals(self):
        response = self.client.post(
            "/api/interactions/video",
            {"facialSignals": {"emotion": "stressed", "tension": 88, "fatigue": 30, "valence": 25}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        mood_log = response.json()["moodLog"]
        self.assertEqual(mood_log["emotion"], "stressed")
        self.assertEqual(mood_log["details"]["analysisEngine"], "facial-signal-fusion-v1")
        self.assertEqual(mood_log["details"]["signals"]["tension"], 88)

    def test_video_interaction_rejects_a_non_object_signal_map(self):
        response = self.client.post(
            "/api/interactions/video",
            {"facialSignals": ["stressed", 88]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_video_interaction_rejects_an_oversized_signal_map(self):
        response = self.client.post(
            "/api/interactions/video",
            {"facialSignals": {f"key{index}": index for index in range(25)}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_unknown_emotion_in_facial_signals_is_ignored_not_stored(self):
        response = self.client.post(
            "/api/interactions/video",
            {"facialSignals": {"emotion": "elated", "tension": 10, "fatigue": 10, "valence": 95}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(response.json()["moodLog"]["emotion"], ("happy", "calm"))

    def test_mood_entry_rejects_an_unknown_source_mode_and_blank_emotion(self):
        for payload in (
            {"emotion": "calm", "sourceMode": "telepathy"},
            {"emotion": "", "sourceMode": "text"},
            {"sourceMode": "text"},
        ):
            with self.subTest(payload=payload):
                response = self.client.post("/api/mood", payload, format="json")
                self.assertEqual(response.status_code, 400)

    def test_unscored_entries_do_not_inflate_the_burnout_score(self):
        baseline = self.client.get("/api/mood/burnout-risk").json()["burnoutRisk"]
        for _ in range(3):
            self.client.post(
                "/api/interactions/voice",
                {"audioBase64": "AAAAAAAAAAAAAAAAAAAA"},
                format="json",
            )
        after = self.client.get("/api/mood/burnout-risk").json()["burnoutRisk"]
        # Neutral, low-confidence entries should keep the score in the "Low" band.
        self.assertLess(after, 45)
        self.assertLessEqual(abs(after - baseline), 25)


@override_settings(FRONTEND_URL="http://127.0.0.1:5173", OPENAI_API_KEY="")
class AccountEmailDeliveryTests(TestCase):
    """The signup flow must never leave an account that can't be activated."""

    def setUp(self):
        self.client = APIClient()

    def _payload(self, email="mailer@example.com"):
        return {
            "firstName": "Mail",
            "lastName": "Tester",
            "email": email,
            "password": "strongpass123",
            "passwordConfirm": "strongpass123",
            "agreeToTerms": True,
        }

    @override_settings(DEBUG=False, DEMO_AUTO_VERIFY=True)
    def test_demo_auto_verify_allows_immediate_login(self):
        response = self.client.post("/api/auth/register", self._payload(), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["autoVerified"])
        self.assertTrue(MindGuardUser.objects.get(email="mailer@example.com").is_verified)

        login = self.client.post(
            "/api/auth/login",
            {"email": "mailer@example.com", "password": "strongpass123"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertIn("authToken", login.json())

    @override_settings(DEBUG=False, DEMO_AUTO_VERIFY=False)
    def test_demo_auto_verify_off_still_requires_verification(self):
        self.client.post("/api/auth/register", self._payload(), format="json")
        self.assertFalse(MindGuardUser.objects.get(email="mailer@example.com").is_verified)

        login = self.client.post(
            "/api/auth/login",
            {"email": "mailer@example.com", "password": "strongpass123"},
            format="json",
        )
        self.assertEqual(login.status_code, 403)

    @override_settings(DEBUG=False, DEMO_AUTO_VERIFY=False)
    @mock.patch("wellness.views.send_mail", side_effect=SMTPAuthenticationError(535, b"Authentication failed"))
    def test_failed_verification_email_is_reported_not_swallowed(self, mocked_send):
        response = self.client.post("/api/auth/register", self._payload(), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertTrue(mocked_send.called)
        body = response.json()
        # The user must be told delivery failed rather than being sent to an
        # inbox that will never receive anything.
        self.assertIs(body["emailDelivered"], False)
        self.assertIn("could not be sent", body["message"])
        # With DEBUG off, the raw SMTP error must not leak to the client.
        self.assertNotIn("emailError", body)

    @override_settings(DEBUG=True, DEMO_AUTO_VERIFY=False)
    @mock.patch("wellness.views.send_mail", side_effect=SMTPAuthenticationError(535, b"Authentication failed"))
    def test_debug_mode_exposes_the_smtp_error_for_diagnosis(self, _mocked_send):
        response = self.client.post("/api/auth/register", self._payload(), format="json")
        self.assertIn("emailError", response.json())

    @override_settings(DEBUG=False, DEMO_AUTO_VERIFY=False)
    @mock.patch("wellness.views.send_mail", side_effect=SMTPAuthenticationError(535, b"nope"))
    def test_password_reset_still_does_not_leak_account_existence_when_mail_fails(self, _mocked_send):
        self.client.post("/api/auth/register", self._payload(), format="json")
        response = self.client.post(
            "/api/auth/password-reset/request",
            {"email": "mailer@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "If that email exists, a reset link has been sent.")

    @override_settings(
        DEBUG=False,
        DEMO_AUTO_VERIFY=False,
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    )
    def test_successful_send_reports_no_delivery_problem(self):
        mail.outbox.clear()
        response = self.client.post("/api/auth/register", self._payload(), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("emailDelivered", response.json())
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/verify-email?token=", mail.outbox[0].body)


@override_settings(DEBUG=True, DEMO_AUTO_VERIFY=True, OPENAI_API_KEY="")
class AccountDataRightsTests(TestCase):
    """Export and deletion — the promises the privacy pitch rests on."""

    def setUp(self):
        self.client = APIClient()
        self.client.post(
            "/api/auth/register",
            {
                "firstName": "Data",
                "lastName": "Owner",
                "email": "owner@example.com",
                "password": "strongpass123",
                "passwordConfirm": "strongpass123",
                "agreeToTerms": True,
            },
            format="json",
        )
        token = self.client.post(
            "/api/auth/login",
            {"email": "owner@example.com", "password": "strongpass123"},
            format="json",
        ).json()["authToken"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.client.post("/api/interactions/text", {"text": "I feel stressed"}, format="json")

    def test_export_requires_authentication(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get("/api/account/export").status_code, 401)

    def test_export_returns_the_account_and_its_logs(self):
        response = self.client.get("/api/account/export")
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body["account"]["email"], "owner@example.com")
        self.assertEqual(len(body["moodLogs"]), 1)
        self.assertIn("burnoutSnapshot", body)
        self.assertIn("attachment", response["Content-Disposition"])

    def test_export_never_includes_the_password_hash(self):
        body = self.client.get("/api/account/export").json()
        self.assertNotIn("password_hash", str(body))
        self.assertNotIn("passwordHash", body["account"])

    def test_delete_requires_the_correct_password(self):
        response = self.client.delete(
            "/api/account/delete", {"password": "wrongpassword"}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(MindGuardUser.objects.filter(email="owner@example.com").exists())

    def test_delete_requires_a_password_at_all(self):
        response = self.client.delete("/api/account/delete", {}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(MindGuardUser.objects.filter(email="owner@example.com").exists())

    def test_delete_removes_the_account_and_its_mood_logs(self):
        user = MindGuardUser.objects.get(email="owner@example.com")
        self.assertEqual(MoodLog.objects.filter(client_user_id=str(user.external_id)).count(), 1)

        response = self.client.delete(
            "/api/account/delete", {"password": "strongpass123"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["deletedMoodLogs"], 1)

        self.assertFalse(MindGuardUser.objects.filter(email="owner@example.com").exists())
        # No orphaned rows: MoodLog.user is SET_NULL, so these must be deleted
        # explicitly or they would survive the account.
        self.assertEqual(MoodLog.objects.filter(client_user_id=str(user.external_id)).count(), 0)

    def test_delete_requires_authentication(self):
        anonymous = APIClient()
        response = anonymous.delete(
            "/api/account/delete", {"password": "strongpass123"}, format="json"
        )
        self.assertEqual(response.status_code, 401)


@override_settings(DEBUG=True, DEMO_AUTO_VERIFY=True, OPENAI_API_KEY="")
class CompanionReplyTests(TestCase):
    """Server-side reply generation, including the safety contract."""

    def setUp(self):
        self.client = APIClient()
        self.client.post(
            "/api/auth/register",
            {
                "firstName": "Reply",
                "lastName": "Tester",
                "email": "reply@example.com",
                "password": "strongpass123",
                "passwordConfirm": "strongpass123",
                "agreeToTerms": True,
            },
            format="json",
        )
        token = self.client.post(
            "/api/auth/login",
            {"email": "reply@example.com", "password": "strongpass123"},
            format="json",
        ).json()["authToken"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_requires_authentication(self):
        anonymous = APIClient()
        response = anonymous.post("/api/companion/reply", {"text": "hello"}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_rejects_blank_text(self):
        response = self.client.post("/api/companion/reply", {"text": "   "}, format="json")
        self.assertEqual(response.status_code, 400)

    @override_settings(GEMINI_API_KEY="")
    def test_reports_offline_when_no_key_configured(self):
        response = self.client.post("/api/companion/reply", {"text": "i feel low"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["source"], "offline")
        self.assertEqual(response.json()["reason"], "not-configured")

    @override_settings(GEMINI_API_KEY="fake-key-should-never-be-used")
    @mock.patch("wellness.companion.urllib.request.urlopen")
    def test_crisis_turn_never_reaches_the_model(self, mocked_urlopen):
        """The safety contract, enforced server-side as well as in the client."""
        for payload in (
            {"text": "i want to end it all", "analysis": {"urgency": "high"}},
            {"text": "i want to hurt myself", "analysis": {"topicFlags": {"selfHarm": True}}},
        ):
            with self.subTest(payload=payload):
                response = self.client.post("/api/companion/reply", payload, format="json")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["source"], "offline")
                self.assertEqual(response.json()["reason"], "crisis-path")

        mocked_urlopen.assert_not_called()

    @override_settings(GEMINI_API_KEY="fake-key")
    @mock.patch("wellness.companion.urllib.request.urlopen")
    def test_normal_turn_calls_the_model_and_returns_the_reply(self, mocked_urlopen):
        body = json.dumps(
            {"candidates": [{"content": {"parts": [{"text": "Of course you cannot, not yet."}]}, "finishReason": "STOP"}]}
        ).encode()
        mocked_urlopen.return_value.__enter__.return_value.read.return_value = body

        response = self.client.post(
            "/api/companion/reply",
            {"text": "my girlfriend left me", "analysis": {"emotion": "sad", "topicFlags": {"heartbreak": True}}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["source"], "gemini")
        self.assertIn("Of course you cannot", response.json()["reply"])
        mocked_urlopen.assert_called_once()

    @override_settings(GEMINI_API_KEY="fake-key")
    @mock.patch("wellness.companion.urllib.request.urlopen", side_effect=OSError("network down"))
    def test_network_failure_degrades_to_offline(self, _mocked):
        response = self.client.post("/api/companion/reply", {"text": "hi"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["source"], "offline")

    def test_heartbreak_is_detected_as_a_topic(self):
        response = self.client.post(
            "/api/interactions/text",
            {"text": "my girlfriend left me and my love failed, i cannot move on"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        details = response.json()["moodLog"]["details"]
        self.assertTrue(details["topicFlags"]["heartbreak"])
        self.assertEqual(details["supportStyle"], "connection")
        self.assertEqual(response.json()["moodLog"]["emotion"], "sad")

    def test_heavy_topics_get_a_longer_reply_budget(self):
        from .companion import _build_system_instruction

        heavy = _build_system_instruction({}, {"emotion": "sad", "topicFlags": {"heartbreak": True}})
        light = _build_system_instruction({}, {"emotion": "calm", "topicFlags": {}})
        self.assertIn("4 to 7 sentences", heavy)
        self.assertIn("2 to 4 sentences", light)

    def test_prompt_forbids_the_scripted_openers(self):
        from .companion import _build_system_instruction

        prompt = _build_system_instruction({}, {"emotion": "sad", "topicFlags": {}})
        self.assertIn("I'm sorry to hear that", prompt)
        self.assertIn("Do not just validate and stop", prompt)
        self.assertIn("never pretend", prompt.lower())
