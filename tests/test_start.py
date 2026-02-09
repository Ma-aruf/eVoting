#!/usr/bin/env python
import os
import sys

# Add the project directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'evoting.settings')

try:
    import django
    django.setup()
    print("SUCCESS: Django setup completed successfully")
    
    # Test basic imports
    from django.http import JsonResponse
    print("SUCCESS: Django imports working")
    
    # Test database connection
    from django.db import connection
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    print("SUCCESS: Database connection working")
    
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
