#!/usr/bin/env python
import os
import django
import requests
import json

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'evoting.settings')
django.setup()

from core.models import Election, Student

def test_activation():
    print("🧪 Testing Activation with Composite Constraint")
    print("=" * 50)
    
    # Get existing elections
    elections = list(Election.objects.all().values('id', 'name'))
    print(f'Found {len(elections)} elections:')
    for e in elections:
        print(f'  ID: {e["id"]}, Name: {e["name"]}')
    
    if len(elections) < 2:
        print("❌ Need at least 2 elections to test activation properly")
        return
    
    # Create test students in different elections with same ID
    election1_id = elections[0]['id']
    election2_id = elections[1]['id']
    
    print(f'\n📝 Creating test students with ID "ACTIV001" in both elections...')
    
    try:
        student1 = Student.objects.create(
            student_id='ACTIV001',
            full_name='Test Student One',
            class_name='Test Class',
            election_id=election1_id,
            is_active=False
        )
        print(f'✅ Created inactive student in {elections[0]["name"]}: {student1}')
    except Exception as e:
        print(f'❌ Failed to create student in {elections[0]["name"]}: {e}')
        return
    
    try:
        student2 = Student.objects.create(
            student_id='ACTIV001',  # Same ID
            full_name='Test Student Two',
            class_name='Test Class',
            election_id=election2_id,
            is_active=False
        )
        print(f'✅ Created inactive student in {elections[1]["name"]}: {student2}')
    except Exception as e:
        print(f'❌ Failed to create student in {elections[1]["name"]}: {e}')
        return
    
    # Test activation via API (if server is running)
    print(f'\n🔄 Testing activation API...')
    
    try:
        # Test activating student in first election
        activation_data = {
            'student_id': 'ACTIV001',
            'election_id': election1_id,
            'is_active': True
        }
        
        print(f'📤 Sending activation request for student in {elections[0]["name"]}...')
        print(f'   Data: {activation_data}')
        
        # Note: This would require the server to be running and authentication
        # For now, we'll test the backend logic directly
        
        # Test the backend logic directly
        from core.views import StudentActivationView
        
        # Mock request object
        class MockRequest:
            def __init__(self, data):
                self.data = data
        
        request = MockRequest(activation_data)
        view = StudentActivationView()
        
        try:
            response = view.post(request)
            print(f'✅ Activation successful: {response.data}')
        except Exception as e:
            print(f'❌ Activation failed: {e}')
        
        # Check if student was activated
        student1.refresh_from_db()
        print(f'📊 Student 1 status after activation: {"Active" if student1.is_active else "Inactive"}')
        
        # Verify student 2 is still inactive
        student2.refresh_from_db()
        print(f'📊 Student 2 status (should be unchanged): {"Active" if student2.is_active else "Inactive"}')
        
    except Exception as e:
        print(f'❌ API test failed: {e}')
    
    # Clean up test data
    print(f'\n🧹 Cleaning up test data...')
    Student.objects.filter(student_id='ACTIV001').delete()
    print('✅ Test data cleaned up')
    
    print(f'\n🎉 Activation test completed!')

if __name__ == '__main__':
    test_activation()
