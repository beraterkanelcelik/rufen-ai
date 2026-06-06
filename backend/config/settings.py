import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "daphne", "channels", "corsheaders",
    "django.contrib.contenttypes", "django.contrib.auth", "django.contrib.staticfiles",
    "calls",
]
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [], "APP_DIRS": True, "OPTIONS": {},
}]
ASGI_APPLICATION = "config.asgi.application"
CHANNEL_LAYERS = {"default": {
    "BACKEND": "channels_redis.core.RedisChannelLayer",
    "CONFIG": {"hosts": [os.environ.get("REDIS_URL", "redis://redis:6379/0")]},
}}
DATABASES = {"default": {
    "ENGINE": "django.db.backends.postgresql",
    "NAME": "rufen", "USER": "rufen", "PASSWORD": "rufen", "HOST": "db", "PORT": "5432",
}}
STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
