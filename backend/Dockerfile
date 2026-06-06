FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# No system deps needed: psycopg[binary] ships its own libpq.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

# Default command; docker-compose overrides per service (web=daphne, worker=temporal_app.worker).
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
