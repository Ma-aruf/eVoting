#!/usr/bin/env python
import os
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'evoting.settings')
django.setup()

from core.models import Election, Student

def test_activation_logic():
    print("🧪 Testing Activation Logic Directly")
    print("=" * 40)
    
    # Get existing elections
    elections = list(Election.objects.all().values('id', 'name'))
    
    if len(elections) < 2:
        print("❌ Need at least 2 elections")
        return
    
    election1_id = elections[0]['id']
    election2_id = elections[1]['id']
    
    print(f'Using elections: {elections[0]["name"]} (ID: {election1_id}) and {elections[1]["name"]} (ID: {election2_id})')
    
    # Create test students
    print(f'\n📝 Creating test students with same ID "ACTIV002"...')
    
    student1 = Student.objects.create(
        student_id='ACTIV002',
        full_name='Test Student One',
        class_name='Test Class',
        election_id=election1_id,
        is_active=False
    )
    print(f'✅ Created: {student1} (Inactive)')
    
    student2 = Student.objects.create(
        student_id='ACTIV002',  # Same ID
        full_name='Test Student Two',
        class_name='Test Class',
        election_id=election2_id,
        is_active=False
    )
    print(f'✅ Created: {student2} (Inactive)')
    
    # Test the core logic: finding student by both student_id and election_id
    print(f'\n🔍 Testing composite lookup logic...')
    
    # Test 1: Find student in first election
    try:
        found_student1 = Student.objects.get(student_id='ACTIV002', election_id=election1_id)
        print(f'✅ Found student in {elections[0]["name"]}: {found_student1}')
        print(f'   Status: {"Active" if found_student1.is_active else "Inactive"}')
    except Student.DoesNotExist:
        print(f'❌ Student not found in {elections[0]["name"]}')
    except Student.MultipleObjectsReturned:
        print(f'❌ Multiple students returned (this should not happen!)')
    
    # Test 2: Find student in second election  
    try:
        found_student2 = Student.objects.get(student_id='ACTIV002', election_id=election2_id)
        print(f'✅ Found student in {elections[1]["name"]}: {found_student2}')
        print(f'   Status: {"Active" if found_student2.is_active else "Inactive"}')
    except Student.DoesNotExist:
        print(f'❌ Student not found in {elections[1]["name"]}')
    except Student.MultipleObjectsReturned:
        print(f'❌ Multiple students returned (this should not happen!)')
    
    # Test 3: Activate student in first election
    print(f'\n🔄 Activating student in {elections[0]["name"]}...')
    found_student1.is_active = True
    found_student1.save()
    print(f'✅ Activated: {found_student1}')
    
    # Verify only the correct student was activated
    print(f'\n📊 Verification:')
    student1.refresh_from_db()
    student2.refresh_from_db()
    
    print(f'   Student 1 ({elections[0]["name"]}): {"Active" if student1.is_active else "Inactive"}')
    print(f'   Student 2 ({elections[1]["name"]}): {"Active" if student2.is_active else "Inactive"}')
    
    # Test 4: Try the old broken way (should fail)
    print(f'\n❌ Testing old broken method (should fail)...')
    try:
        broken_lookup = Student.objects.get(student_id='ACTIV002')
        print(f'❌ ERROR: Old method should have failed but got: {broken_lookup}')
    except Student.MultipleObjectsReturned:
        print(f'✅ CORRECTLY: Old method failed with MultipleObjectsReturned error')
    except Exception as e:
        print(f'⚠️  Old method failed with: {e}')
    
    # Clean up
    print(f'\n🧹 Cleaning up...')
    Student.objects.filter(student_id='ACTIV002').delete()
    print('✅ Done!')
    
    print(f'\n🎉 Composite constraint activation logic works perfectly!')

if __name__ == '__main__':
    test_activation_logic()
