#!/usr/bin/env python
import os
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'evoting.settings')
django.setup()

from core.models import Election, Student, Position, Candidate
from django.contrib.auth import get_user_model

User = get_user_model()

def test_voting_logic():
    print("🧪 Testing Voting Logic with Composite Constraint")
    print("=" * 50)
    
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
        print('❌ No active elections found for voting test')
        return
    
    active_election = active_elections[0]
    print(f'\n🎯 Using active election: {active_election["name"]} (ID: {active_election["id"]})')
    
    # Create test students with same ID in different elections
    print(f'\n📝 Creating test students with same ID "VOTE001"...')
    
    try:
        # Student in active election
        student_active = Student.objects.create(
            student_id='VOTE001',
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
                student_id='VOTE001',  # Same ID
                full_name='Inactive Election Student',
                class_name='Test Class',
                election_id=inactive_elections[0]['id'],
                is_active=True,
                has_voted=False
            )
            print(f'✅ Created student in inactive election: {student_inactive}')
        except Exception as e:
            print(f'❌ Failed to create student in inactive election: {e}')
    
    # Test 1: Student login for active election
    print(f'\n🔐 Test 1: Student login for active election...')
    
    try:
        from core.views import StudentVoterLoginView
        from django.test import RequestFactory
        
        # Mock request
        factory = RequestFactory()
        request = factory.post('/api/students/voter-login/', {
            'student_id': 'VOTE001'
        })
        
        view = StudentVoterLoginView()
        response = view.post(request)
        
        print(f'📥 Response Status: {response.status_code}')
        print(f'📥 Response Data: {response.data}')
        
        if response.status_code == 200:
            print('✅ Student login successful for active election!')
            token = response.data.get('token')
            print(f'🎫 Generated token: {token[:20]}...')
        else:
            print(f'❌ Student login failed: {response.data.get("detail")}')
            
    except Exception as e:
        print(f'❌ Login test failed: {e}')
    
    # Test 2: Student lookup by composite key
    print(f'\n🔍 Test 2: Composite student lookup...')
    
    try:
        # This should find exactly one student (the one in active election)
        found_student = Student.objects.get(student_id='VOTE001', election_id=active_election['id'])
        print(f'✅ Found student in active election: {found_student}')
        
        # This should also work (using election object)
        found_student_alt = Student.objects.get(student_id='VOTE001', election_id=active_election['id'])
        print(f'✅ Alternative lookup also works: {found_student_alt}')
        
    except Student.MultipleObjectsReturned:
        print('❌ ERROR: Multiple students returned (composite constraint failed!)')
    except Student.DoesNotExist:
        print('❌ Student not found in active election')
    except Exception as e:
        print(f'❌ Lookup failed: {e}')
    
    # Test 3: Verify old method would fail
    print(f'\n❌ Test 3: Old method (should fail)...')
    
    try:
        old_lookup = Student.objects.get(student_id='VOTE001')
        print(f'❌ ERROR: Old method should have failed but got: {old_lookup}')
    except Student.MultipleObjectsReturned:
        print('✅ CORRECTLY: Old method failed with MultipleObjectsReturned')
    except Exception as e:
        print(f'⚠️  Old method failed with: {e}')
    
    # Test 4: Check if student can vote (simulate voting logic)
    print(f'\n🗳️  Test 4: Voting eligibility check...')
    
    try:
        student_active.refresh_from_db()
        print(f'   Student Status: {"Active" if student_active.is_active else "Inactive"}')
        print(f'   Voted Status: {"Yes" if student_active.has_voted else "No"}')
        
        if student_active.is_active and not student_active.has_voted:
            print('✅ Student is eligible to vote!')
        else:
            print('❌ Student is not eligible to vote')
            
    except Exception as e:
        print(f'❌ Eligibility check failed: {e}')
    
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
    
    print(f'\n🎉 Voting logic test completed!')

if __name__ == '__main__':
    test_voting_logic()
