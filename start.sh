#!/bin/bash
# Startup script for Railway deployment

echo "Starting Django application..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "WARNING: DATABASE_URL not set, checking for PG* variables..."
    if [ -z "$PGHOST" ]; then
        echo "ERROR: No database configuration found"
        exit 1
    fi
fi

echo "Database configuration found:"
echo "DATABASE_URL: ${DATABASE_URL:0:20}..."
echo "PGHOST: $PGHOST"
echo "PGDATABASE: $PGDATABASE"

# Wait a bit for database to be ready
echo "Waiting for database to be ready..."
sleep 10

# Test database connection with a simple approach
echo "Testing database connection..."
python manage.py check --database default

if [ $? -eq 0 ]; then
    echo "Database connection successful!"

    echo "Running migrations..."
    python manage.py migrate --noinput

    # Collect static files
    echo "Collecting static files..."
    python manage.py collectstatic --noinput

    echo "Starting Gunicorn..."
    # Give extra time for everything to be ready
    sleep 5
    exec gunicorn evoting.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --log-level debug
else
    echo "Database connection failed, but proceeding anyway..."
    echo "Starting Gunicorn without migrations..."
    exec gunicorn evoting.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --log-level debug
fi
