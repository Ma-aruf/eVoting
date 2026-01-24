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
    
    # Run migrations
    echo "Running migrations..."
    python manage.py migrate --noinput
    
    # Collect static files
    echo "Collecting static files..."
    python manage.py collectstatic --noinput
    
    echo "Starting Gunicorn..."
    # Start Gunicorn in background
    gunicorn evoting.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --log-level debug &
    GUNICORN_PID=$!
    
    echo "Waiting for Gunicorn to be ready..."
    # Wait for Gunicorn to be ready to accept requests
    for i in {1..30}; do
        if curl -s http://localhost:$PORT/ > /dev/null 2>&1; then
            echo "Gunicorn is ready! Health check should pass."
            # Keep the process running
            wait $GUNICORN_PID
        else
            echo "Attempt $i: Gunicorn not ready yet, waiting 2 seconds..."
            sleep 2
        fi
    done
    
    echo "Gunicorn failed to become ready in time, but keeping it running..."
    wait $GUNICORN_PID
else
    echo "Database connection failed, but proceeding anyway..."
    echo "Starting Gunicorn without migrations..."
    exec gunicorn evoting.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --log-level debug
fi
