#!/bin/bash
set -e

echo "Starting Gunicorn..."
exec gunicorn evoting.wsgi:application \
  --bind 0.0.0.0:$PORT \
  --workers 1 \
  --timeout 120 \
  --log-level info
