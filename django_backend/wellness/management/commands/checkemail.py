"""Diagnose outbound email configuration.

    python manage.py checkemail                 # show config + test the connection
    python manage.py checkemail --to a@b.com    # also send a real test message

Written for Brevo, but works for any SMTP backend. Run it on the deployment
(Render shell) rather than locally — the whole point is to test the credentials
the server actually has.
"""

from django.conf import settings
from django.core.mail import get_connection, send_mail
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Verify SMTP settings and optionally send a test email."

    def add_arguments(self, parser):
        parser.add_argument("--to", help="Address to send a real test message to.")

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("Email configuration"))
        for label, value in [
            ("EMAIL_BACKEND", settings.EMAIL_BACKEND),
            ("EMAIL_HOST", settings.EMAIL_HOST),
            ("EMAIL_PORT", settings.EMAIL_PORT),
            ("EMAIL_USE_TLS", settings.EMAIL_USE_TLS),
            ("EMAIL_HOST_USER", settings.EMAIL_HOST_USER or "(empty)"),
            # Never print the key itself — only whether one is present.
            ("EMAIL_HOST_PASSWORD", f"set, {len(settings.EMAIL_HOST_PASSWORD)} chars" if settings.EMAIL_HOST_PASSWORD else "(empty)"),
            ("DEFAULT_FROM_EMAIL", settings.DEFAULT_FROM_EMAIL),
            ("EMAIL_FAIL_SILENTLY", settings.EMAIL_FAIL_SILENTLY),
            ("DEMO_AUTO_VERIFY", settings.DEMO_AUTO_VERIFY),
            ("FRONTEND_URL", settings.FRONTEND_URL),
        ]:
            self.stdout.write(f"  {label:22} {value}")

        problems = self._find_problems()
        if problems:
            self.stdout.write(self.style.WARNING("\nProblems found"))
            for problem in problems:
                self.stdout.write(self.style.WARNING(f"  - {problem}"))

        if "console" in settings.EMAIL_BACKEND:
            self.stdout.write(
                self.style.NOTICE("\nConsole backend active: mail is printed, not delivered. Nothing to test.")
            )
            return

        self.stdout.write(self.style.MIGRATE_HEADING("\nConnection test"))
        try:
            connection = get_connection(fail_silently=False)
            connection.open()
            connection.close()
            self.stdout.write(self.style.SUCCESS("  SMTP connect + authenticate OK"))
        except Exception as error:  # noqa: BLE001 - this command exists to report it
            self.stdout.write(self.style.ERROR(f"  FAILED: {error}"))
            self.stdout.write(
                self.style.NOTICE(
                    "  If this is Brevo and you see '535 Authentication failed', EMAIL_HOST_USER is\n"
                    "  probably wrong. It must be the SMTP login from Brevo (SMTP & API -> SMTP),\n"
                    "  which looks like 9a1b2c001@smtp-brevo.com — not your account email."
                )
            )
            return

        recipient = options.get("to")
        if not recipient:
            self.stdout.write(self.style.NOTICE("\nPass --to you@example.com to send a real test message."))
            return

        self.stdout.write(self.style.MIGRATE_HEADING(f"\nSending test message to {recipient}"))
        try:
            sent = send_mail(
                subject="MindGuard email test",
                message="If you are reading this, MindGuard can deliver verification emails.",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient],
                fail_silently=False,
            )
            if sent:
                self.stdout.write(self.style.SUCCESS("  Sent. Check the inbox (and spam)."))
            else:
                self.stdout.write(self.style.ERROR("  Backend reported 0 messages sent."))
        except Exception as error:  # noqa: BLE001
            self.stdout.write(self.style.ERROR(f"  FAILED: {error}"))

    def _find_problems(self):
        problems = []
        backend_is_smtp = "smtp" in settings.EMAIL_BACKEND

        if backend_is_smtp and not settings.EMAIL_HOST_USER:
            problems.append("EMAIL_HOST_USER is empty; SMTP auth will fail.")
        if backend_is_smtp and not settings.EMAIL_HOST_PASSWORD:
            problems.append("EMAIL_HOST_PASSWORD is empty; SMTP auth will fail.")
        if "brevo" in settings.EMAIL_HOST and "@" not in settings.EMAIL_HOST_USER:
            problems.append("Brevo EMAIL_HOST_USER usually looks like 9a1b2c001@smtp-brevo.com.")
        if settings.EMAIL_HOST_PASSWORD.startswith("xkeysib-"):
            problems.append("That is a Brevo REST API key. SMTP needs the 'xsmtpsib-' SMTP key instead.")
        if settings.DEFAULT_FROM_EMAIL.endswith("@localhost"):
            problems.append("DEFAULT_FROM_EMAIL must be a real address verified as a Brevo sender.")
        if settings.DEMO_AUTO_VERIFY and not settings.DEBUG:
            problems.append("DEMO_AUTO_VERIFY is on with DEBUG off: anyone can register any address.")
        if settings.EMAIL_FAIL_SILENTLY:
            problems.append("EMAIL_FAIL_SILENTLY hides delivery errors from users and logs.")
        return problems
