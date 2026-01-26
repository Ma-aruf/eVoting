#!/usr/bin/env python
import os
import django
import requests
import json

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'evoting.settings')
django.setup()

from core.models import Election, Position, Candidate, Student, Vote
from core.serializers import MultiVoteSerializer

def debug_500_error():
    print("🔍 Debugging 500 Error in Detail")
    print("=" * 40)
    
    # Get the exact data from frontend
    vote_data = {
        'votes': [
            {'election': 4, 'position': 28, 'candidate': 40},
            {'election': 4, 'position': 29, 'candidate': 38}
        ]
    }
    
    print(f'📤 Vote data: {json.dumps(vote_data, indent=2)}')
    
    # Test 1: Serializer validation
    print(f'\n🧪 Test 1: Serializer validation...')
    
    try:
        serializer = MultiVoteSerializer(data=vote_data)
        if serializer.is_valid():
            print('✅ Serializer validation passed')
            print(f'Validated data: {serializer.validated_data}')
        else:
            print(f'❌ Serializer validation failed: {serializer.errors}')
            return
    except Exception as e:
        print(f'❌ Serializer validation error: {e}')
        import traceback
        traceback.print_exc()
        return
    
    # Test 2: Check database state
    print(f'\n🗄️  Test 2: Check database state...')
    
    try:
        # Check election
        election = Election.objects.get(id=4)
        print(f'✅ Election 4: {election.name} (Active: {election.is_active})')
        
        # Check positions
        position_28 = Position.objects.get(id=28)
        position_29 = Position.objects.get(id=29)
        print(f'✅ Position 28: {position_28.name}')
        print(f'✅ Position 29: {position_29.name}')
        
        # Check candidates
        candidate_40 = Candidate.objects.get(id=40)
        candidate_38 = Candidate.objects.get(id=38)
        print(f'✅ Candidate 40: {candidate_40.student.full_name}')
        print(f'✅ Candidate 38: {candidate_38.student.full_name}')
        
        # Check student
        student = Student.objects.get(student_id='250101', election_id=4)
        print(f'✅ Student 250101: {student.full_name}')
        print(f'   Active: {student.is_active}')
        print(f'   Voted: {student.has_voted}')
        
        # Check existing votes
        existing_votes = Vote.objects.all().count()
        print(f'✅ Total votes in database: {existing_votes}')
        
    except Exception as e:
        print(f'❌ Database state check error: {e}')
        import traceback
        traceback.print_exc()
        return
    
    # Test 3: Get fresh token
    print(f'\n🎫 Test 3: Get fresh token...')
    
    try:
        login_data = {'student_id': '250101'}
        
        login_response = requests.post(
            'http://localhost:8000/api/voter/login/',
            json=login_data,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if login_response.status_code == 200:
            token = login_response.json().get('token')
            print(f'✅ Got token: {token[:20]}...')
        else:
            print(f'❌ Login failed: {login_response.status_code} - {login_response.text}')
            return
            
    except Exception as e:
        print(f'❌ Token request error: {e}')
        return
    
    # Test 4: Submit vote with detailed headers
    print(f'\n🗳️  Test 4: Submit vote with detailed headers...')
    
    try:
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Student-Id': '250101',
            'X-Voter-Token': token
        }
        
        print(f'Headers: {headers}')
        
        response = requests.post(
            'http://localhost:8000/api/vote/',
            json=vote_data,
            headers=headers,
            timeout=10
        )
        
        print(f'📥 Response Status: {response.status_code}')
        print(f'📥 Response Headers: {dict(response.headers)}')
        print(f'📥 Response Body: {response.text}')
        
        if response.status_code == 500:
            print('❌ 500 ERROR DETECTED!')
            
            # Try to get more details from the HTML error page
            if 'text/html' in response.headers.get('content-type', ''):
                print('Got HTML error page - this is a Django 500 error page')
                
        elif response.status_code == 201:
            print('✅ Vote successful!')
            
            # Check final state
            student.refresh_from_db()
            vote_count = Vote.objects.filter(election_id=4).count()
            print(f'📊 Final state:')
            print(f'   Student voted: {student.has_voted}')
            print(f'   Student active: {student.is_active}')
            print(f'   Total votes: {vote_count}')
        else:
            print(f'⚠️  Unexpected status: {response.status_code}')
            
    except Exception as e:
        print(f'❌ Vote submission error: {e}')
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    debug_500_error()
