#!/usr/bin/env python
import os
import django
import requests
import json

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'evoting.settings')
django.setup()

from core.models import Election, Student

def test_activation_endpoint():
    print("🧪 Testing Activation Endpoint Directly")
    print("=" * 45)
    
    # Get existing elections
    elections = list(Election.objects.all().values('id', 'name'))
    print(f'Available elections:')
    for e in elections:
        print(f'  ID: {e["id"]}, Name: {e["name"]}')
    
    if len(elections) == 0:
        print('❌ No elections found')
        return
    
    # Use first election
    election_id = elections[0]['id']
    election_name = elections[0]['name']
    
    print(f'\n📝 Using election: {election_name} (ID: {election_id})')
    
    # Create a test student
    try:
        student = Student.objects.create(
            student_id='TEST_ACTIVATION_001',
            full_name='Test Activation Student',
            class_name='Test Class',
            election_id=election_id,
            is_active=False
        )
        print(f'✅ Created test student: {student}')
    except Exception as e:
        print(f'❌ Failed to create test student: {e}')
        return
    
    # Test the activation endpoint
    print(f'\n🔄 Testing activation endpoint...')
    
    activation_data = {
        'student_id': 'TEST_ACTIVATION_001',
        'election_id': election_id,
        'is_active': True
    }
    
    print(f'📤 Sending request to: http://localhost:8000/api/students/activate/')
    print(f'   Data: {activation_data}')
    
    try:
        response = requests.post(
            'http://localhost:8000/api/students/activate/',
            json=activation_data,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        print(f'📥 Response Status: {response.status_code}')
        print(f'📥 Response Body: {response.text}')
        
        if response.status_code == 200:
            print('✅ Activation successful!')
            
            # Verify the student was activated
            student.refresh_from_db()
            print(f'📊 Student status: {"Active" if student.is_active else "Inactive"}')
            
        else:
            print(f'❌ Activation failed with status {response.status_code}')
            
    except requests.exceptions.ConnectionError:
        print('❌ Could not connect to server. Make sure Django server is running on localhost:8000')
    except requests.exceptions.Timeout:
        print('❌ Request timed out')
    except Exception as e:
        print(f'❌ Request failed: {e}')
    
    # Clean up
    print(f'\n🧹 Cleaning up...')
    try:
        student.delete()
        print('✅ Test student deleted')
    except:
        print('⚠️  Could not delete test student')
    
    print(f'\n🎉 Endpoint test completed!')

if __name__ == '__main__':
    test_activation_endpoint()
