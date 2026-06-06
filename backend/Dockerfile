FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# System deps kept minimal; psycopg[binary] ships its own libpq.
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

# Default command; docker-compose overrides per service (web=daphne, worker=temporal_app.worker).
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
