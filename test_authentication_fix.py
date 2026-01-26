#!/usr/bin/env python
import os
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'evoting.settings')
django.setup()

from core.models import Election, Student
from core.authentication import VoterAuthentication
from django.test import RequestFactory
from rest_framework.exceptions import AuthenticationFailed

def test_authentication_fix():
    print("🧪 Testing Fixed Authentication System")
    print("=" * 40)
    
    # Get elections
    elections = list(Election.objects.all().values('id', 'name', 'is_active'))
    if len(elections) == 0:
        print('❌ No elections found')
        return
    
    active_elections = [e for e in elections if e['is_active']]
    inactive_elections = [e for e in elections if not e['is_active']]
    
    print(f'📊 Found {len(elections)} elections:')
    for e in elections:
        status = "🟢 ACTIVE" if e['is_active'] else "🔴 INACTIVE"
        print(f'  {e["name"]} (ID: {e["id"]}) - {status}')
    
    if len(active_elections) == 0:
        print('❌ No active elections found for authentication test')
        return
    
    active_election = active_elections[0]
    print(f'\n🎯 Using active election: {active_election["name"]} (ID: {active_election["id"]})')
    
    # Create test students with same ID in different elections
    print(f'\n📝 Creating test students with same ID "AUTH001"...')
    
    try:
        # Student in active election
        student_active = Student.objects.create(
            student_id='AUTH001',
            full_name='Active Election Student',
            class_name='Test Class',
            election_id=active_election['id'],
            is_active=True,
            has_voted=False
        )
        print(f'✅ Created student in active election: {student_active}')
    except Exception as e:
        print(f'❌ Failed to create student in active election: {e}')
        return
    
    # Student in inactive election (if exists)
    student_inactive = None
    if inactive_elections:
        try:
            student_inactive = Student.objects.create(
                student_id='AUTH001',  # Same ID
                full_name='Inactive Election Student',
                class_name='Test Class',
                election_id=inactive_elections[0]['id'],
                is_active=True,
                has_voted=False
            )
            print(f'✅ Created student in inactive election: {student_inactive}')
        except Exception as e:
            print(f'❌ Failed to create student in inactive election: {e}')
    
    # Test 1: Authentication with valid student in active election
    print(f'\n🔐 Test 1: Authentication with valid student in active election...')
    
    try:
        from core.utils import generate_voter_hmac
        
        # Generate valid token
        token = generate_voter_hmac('AUTH001')
        
        # Mock request
        factory = RequestFactory()
        request = factory.post('/api/vote/', {})
        request.META['HTTP_X_STUDENT_ID'] = 'AUTH001'
        request.META['HTTP_X_VOTER_TOKEN'] = token
        
        # Test authentication
        auth = VoterAuthentication()
        result = auth.authenticate(request)
        
        if result:
            user, auth_token = result
            print(f'✅ Authentication successful!')
            print(f'   User: {user}')
            print(f'   Student: {user.student}')
            print(f'   Election: {user.student.election.name}')
        else:
            print('❌ Authentication returned None')
            
    except AuthenticationFailed as e:
        print(f'❌ Authentication failed: {e}')
    except Exception as e:
        print(f'❌ Authentication error: {e}')
    
    # Test 2: Authentication with no active election
    print(f'\n❌ Test 2: Authentication with no active election...')
    
    # Temporarily deactivate all elections
    Election.objects.all().update(is_active=False)
    
    try:
        factory = RequestFactory()
        request = factory.post('/api/vote/', {})
        request.META['HTTP_X_STUDENT_ID'] = 'AUTH001'
        request.META['HTTP_X_VOTER_TOKEN'] = token
        
        auth = VoterAuthentication()
        result = auth.authenticate(request)
        
        if result:
            print(f'❌ ERROR: Authentication should have failed but succeeded: {result}')
        else:
            print('✅ Authentication correctly returned None')
            
    except AuthenticationFailed as e:
        print(f'✅ Authentication correctly failed: {e}')
    except Exception as e:
        print(f'⚠️  Unexpected error: {e}')
    
    # Restore active election
    Election.objects.filter(id=active_election['id']).update(is_active=True)
    
    # Test 3: Authentication with invalid student ID
    print(f'\n❌ Test 3: Authentication with invalid student ID...')
    
    try:
        factory = RequestFactory()
        request = factory.post('/api/vote/', {})
        request.META['HTTP_X_STUDENT_ID'] = 'INVALID001'
        request.META['HTTP_X_VOTER_TOKEN'] = token
        
        auth = VoterAuthentication()
        result = auth.authenticate(request)
        
        if result:
            print(f'❌ ERROR: Authentication should have failed but succeeded: {result}')
        else:
            print('✅ Authentication correctly returned None')
            
    except AuthenticationFailed as e:
        print(f'✅ Authentication correctly failed: {e}')
    except Exception as e:
        print(f'⚠️  Unexpected error: {e}')
    
    # Clean up
    print(f'\n🧹 Cleaning up test data...')
    try:
        student_active.delete()
        print('✅ Active election student deleted')
    except:
        pass
        
    if student_inactive:
        try:
            student_inactive.delete()
            print('✅ Inactive election student deleted')
        except:
            pass
    
    print(f'\n🎉 Authentication fix test completed!')

if __name__ == '__main__':
    test_authentication_fix()
