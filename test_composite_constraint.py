#!/usr/bin/env python
import os
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'evoting.settings')
django.setup()

from core.models import Election, Student

# Get existing elections
elections = list(Election.objects.all().values('id', 'name'))
print('Available elections:')
for e in elections:
    print(f'  ID: {e["id"]}, Name: {e["name"]}')

# Try to create a student with same ID in different elections
if len(elections) >= 2:
    print(f'\nTesting composite constraint with elections {elections[0]["id"]} and {elections[1]["id"]}...')
    
    # Create student in first election
    try:
        student1 = Student.objects.create(
            student_id='TEST001',
            full_name='Test Student One',
            class_name='Test Class',
            election_id=elections[0]['id']
        )
        print(f'✅ Created student in election {elections[0]["name"]}: {student1}')
    except Exception as e:
        print(f'❌ Failed to create student in election {elections[0]["name"]}: {e}')
    
    # Try to create same student ID in second election (should succeed)
    try:
        student2 = Student.objects.create(
            student_id='TEST001',  # Same ID
            full_name='Test Student Two',
            class_name='Test Class',
            election_id=elections[1]['id']
        )
        print(f'✅ Created student with same ID in election {elections[1]["name"]}: {student2}')
    except Exception as e:
        print(f'❌ Failed to create student with same ID in election {elections[1]["name"]}: {e}')
    
    # Try to create duplicate in same election (should fail)
    try:
        student3 = Student.objects.create(
            student_id='TEST001',  # Same ID
            full_name='Test Student Three',
            class_name='Test Class',
            election_id=elections[0]['id']  # Same election
        )
        print(f'❌ Unexpectedly created duplicate student in same election: {student3}')
    except Exception as e:
        print(f'✅ Correctly prevented duplicate in same election: {e}')
    
    # Clean up test data
    Student.objects.filter(student_id='TEST001').delete()
    print('🧹 Cleaned up test data')
else:
    print('❌ Need at least 2 elections to test composite constraint')
