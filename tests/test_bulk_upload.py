#!/usr/bin/env python
import os
import django
import requests
import json
from io import BytesIO
from openpyxl import Workbook

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'evoting.settings')
django.setup()

from core.models import Election, Student
from django.contrib.auth import get_user_model

User = get_user_model()

def test_bulk_upload():
    print("🧪 Testing Bulk Upload with Composite Constraint")
    print("=" * 50)
    
    # Get or create test user
    try:
        user = User.objects.get(username='testadmin')
        print(f'✅ Found test user: {user.username}')
    except User.DoesNotExist:
        user = User.objects.create_user(
            username='testadmin',
            password='testpass123',
            role='superuser'
        )
        print(f'✅ Created test user: {user.username}')
    
    # Get elections
    elections = list(Election.objects.all().values('id', 'name'))
    if len(elections) < 2:
        print('❌ Need at least 2 elections for testing')
        return
    
    election1 = elections[0]
    election2 = elections[1]
    
    print(f'\n📝 Using elections:')
    print(f'  Election 1: {election1["name"]} (ID: {election1["id"]})')
    print(f'  Election 2: {election2["name"]} (ID: {election2["id"]})')
    
    # Create test Excel file
    print(f'\n📊 Creating test Excel file...')
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Students"
    
    # Add headers
    ws.append(['student_id', 'full_name', 'class_name'])
    
    # Add test data - some IDs that might exist in other elections
    test_students = [
        ['BULK001', 'Bulk Student One', 'Class A'],
        ['BULK002', 'Bulk Student Two', 'Class B'],
        ['BULK003', 'Bulk Student Three', 'Class C'],
        ['BULK004', 'Bulk Student Four', 'Class D'],
        ['BULK005', 'Bulk Student Five', 'Class E'],
    ]
    
    for student in test_students:
        ws.append(student)
    
    # Save to BytesIO
    excel_buffer = BytesIO()
    wb.save(excel_buffer)
    excel_buffer.seek(0)
    
    print(f'✅ Created Excel file with {len(test_students)} students')
    
    # Login to get token
    print(f'\n🔐 Getting authentication token...')
    
    login_data = {
        'username': 'testadmin',
        'password': 'testpass123'
    }
    
    try:
        login_response = requests.post(
            'http://localhost:8000/api/auth/login/',
            json=login_data,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if login_response.status_code == 200:
            tokens = login_response.json()
            access_token = tokens.get('access')
            print(f'✅ Login successful')
        else:
            print(f'❌ Login failed: {login_response.status_code}')
            return
            
    except Exception as e:
        print(f'❌ Login request failed: {e}')
        return
    
    # Test 1: Upload to first election
    print(f'\n📤 Test 1: Bulk upload to {election1["name"]}...')
    
    files = {'file': ('students.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    data = {'election_id': election1['id']}
    headers = {'Authorization': f'Bearer {access_token}'}
    
    try:
        response = requests.post(
            'http://localhost:8000/api/students/bulk-upload/',
            files=files,
            data=data,
            headers=headers,
            timeout=30
        )
        
        print(f'📥 Response Status: {response.status_code}')
        print(f'📥 Response Body: {response.text}')
        
        if response.status_code == 201:
            result = response.json()
            print(f'✅ Upload successful!')
            print(f'   Created: {result.get("created")} students')
            print(f'   Skipped: {result.get("skipped_existing")} existing')
            print(f'   Election: {result.get("election")}')
            
            # Verify students were created
            students_count = Student.objects.filter(election_id=election1['id']).count()
            print(f'📊 Total students in {election1["name"]}: {students_count}')
            
        else:
            print(f'❌ Upload failed with status {response.status_code}')
            
    except Exception as e:
        print(f'❌ Upload request failed: {e}')
    
    # Reset buffer for second test
    excel_buffer.seek(0)
    
    # Test 2: Upload same students to second election (should work with same IDs)
    print(f'\n📤 Test 2: Upload same students to {election2["name"]}...')
    
    files = {'file': ('students.xlsx', excel_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
    data = {'election_id': election2['id']}
    
    try:
        response = requests.post(
            'http://localhost:8000/api/students/bulk-upload/',
            files=files,
            data=data,
            headers=headers,
            timeout=30
        )
        
        print(f'📥 Response Status: {response.status_code}')
        print(f'📥 Response Body: {response.text}')
        
        if response.status_code == 201:
            result = response.json()
            print(f'✅ Upload successful!')
            print(f'   Created: {result.get("created")} students')
            print(f'   Skipped: {result.get("skipped_existing")} existing')
            print(f'   Election: {result.get("election")}')
            
            # Verify students were created in second election
            students_count = Student.objects.filter(election_id=election2['id']).count()
            print(f'📊 Total students in {election2["name"]}: {students_count}')
            
        else:
            print(f'❌ Upload failed with status {response.status_code}')
            
    except Exception as e:
        print(f'❌ Upload request failed: {e}')
    
    # Verify composite constraint is working
    print(f'\n🔍 Verifying composite constraint...')
    
    for student_id in ['BULK001', 'BULK002', 'BULK003']:
        students_e1 = Student.objects.filter(student_id=student_id, election_id=election1['id'])
        students_e2 = Student.objects.filter(student_id=student_id, election_id=election2['id'])
        
        print(f'   Student {student_id}:')
        print(f'     In {election1["name"]}: {students_e1.count()} records')
        print(f'     In {election2["name"]}: {students_e2.count()} records')
    
    # Clean up test data
    print(f'\n🧹 Cleaning up test data...')
    Student.objects.filter(student_id__in=['BULK001', 'BULK002', 'BULK003', 'BULK004', 'BULK005']).delete()
    print('✅ Test students deleted')
    
    print(f'\n🎉 Bulk upload test completed!')

if __name__ == '__main__':
    test_bulk_upload()
