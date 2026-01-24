#!/bin/bash
# Startup script for Railway deployment

echo "Starting Django application..."

# Wait for database to be ready
echo "Waiting for database connection..."
python manage.py dbshell --command "SELECT 1;" 2>/dev/null
while [ $? -ne 0 ]; do
    echo "Database not ready, waiting 5 seconds..."
    sleep 5
    python manage.py dbshell --command "SELECT 1;" 2>/dev/null
done

echo "Database is ready!"

# Run migrations
echo "Running migrations..."
python manage.py migrate --noinput

# Collect static files
echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting Gunicorn..."
exec gunicorn evoting.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --log-level debug
