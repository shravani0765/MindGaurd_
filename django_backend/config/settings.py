import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def env_str(name, default=""):
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    return value if value else default


def env_bool(name, default=False):
    return env_str(name, str(default)).lower() in {"1", "true", "yes", "on"}


def env_int(name, default):
    value = env_str(name, str(default))
    try:
        return int(value)
    except ValueError:
        return default

SECRET_KEY = env_str("DJANGO_SECRET_KEY", "mindguard-dev-secret-key")
DEBUG = env_bool("DEBUG", True)
ALLOWED_HOSTS = [
    host.strip()
    for host in env_str("ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")
    if host.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "wellness",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASE_URL = env_str("DATABASE_URL", "")
DATABASES = {
    "default": dj_database_url.parse(
        DATABASE_URL,
        conn_max_age=env_int("DATABASE_CONN_MAX_AGE", 600),
        ssl_require=env_bool("DATABASE_SSL_REQUIRE", not DEBUG),
    )
    if DATABASE_URL
    else {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = env_str("APP_TIME_ZONE", "Asia/Kolkata")

USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

FRONTEND_URL = env_str("FRONTEND_URL", "http://127.0.0.1:5173")
AUTH_TOKEN_TTL_SECONDS = env_int("AUTH_TOKEN_TTL_SECONDS", 60 * 60 * 12)
REFRESH_TOKEN_TTL_SECONDS = env_int("REFRESH_TOKEN_TTL_SECONDS", 60 * 60 * 24 * 14)
PASSWORD_RESET_TOKEN_TTL_SECONDS = env_int("PASSWORD_RESET_TOKEN_TTL_SECONDS", 60 * 60 * 2)
OPENAI_API_KEY = env_str("OPENAI_API_KEY", "")
OPENAI_BASE_URL = env_str("OPENAI_BASE_URL", "")
OPENAI_MODEL = env_str("OPENAI_MODEL", "gpt-5-mini")
OPENAI_TIMEOUT_SECONDS = env_int("OPENAI_TIMEOUT_SECONDS", 12)

# Gemini powers the companion's conversational replies. The key stays here,
# server-side: a VITE_ variable would be inlined into the JS bundle and
# readable by anyone with DevTools, which means anyone could spend the quota.
GEMINI_API_KEY = env_str("GEMINI_API_KEY", "")
GEMINI_MODEL = env_str("GEMINI_MODEL", "gemini-2.0-flash")

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in env_str(
        "CORS_ALLOWED_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3000,http://localhost:3000",
    ).split(",")
    if origin.strip()
]
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

# --- Outbound email -------------------------------------------------------
# Defaults target Brevo (formerly Sendinblue) SMTP relay. Only the host/port
# are defaulted here; credentials must come from the environment.
#
# Brevo gotcha: EMAIL_HOST_USER is the SMTP *login* from the Brevo dashboard
# (SMTP & API -> SMTP), which looks like "9a1b2c001@smtp-brevo.com". It is not
# your Brevo account email, and it is not the API key. EMAIL_HOST_PASSWORD is
# the "xsmtpsib-..." key.
EMAIL_BACKEND = env_str(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend",
)
EMAIL_HOST = env_str("EMAIL_HOST", "smtp-relay.brevo.com")
EMAIL_PORT = env_int("EMAIL_PORT", 587)
EMAIL_HOST_USER = env_str("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env_str("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_TIMEOUT = env_int("EMAIL_TIMEOUT", 20)
DEFAULT_FROM_EMAIL = env_str("DEFAULT_FROM_EMAIL", "mindguard@localhost")

# Swallowing send errors hid a permanently-unverifiable signup: the mail failed,
# nothing was logged, and the account could never log in. Failures are now
# raised into the view, which logs them and reports a usable status instead.
EMAIL_FAIL_SILENTLY = env_bool("EMAIL_FAIL_SILENTLY", False)

# Demo escape hatch: mark new accounts verified on creation so a deployment
# without working SMTP can still be signed into. Never enable in production —
# it lets anyone register against an address they do not control.
DEMO_AUTO_VERIFY = env_bool("DEMO_AUTO_VERIFY", False)

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
