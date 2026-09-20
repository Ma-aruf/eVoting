"""
Test staff user permissions to ensure they can only access their assigned election.
Staff users should be able to:
- View only their assigned election
- Add voters to their assigned election
- View and add candidates to their assigned election
- View and create positions in their assigned election
- Start/stop their assigned election
- Activate voters in their assigned election
- View results for their assigned election
"""

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from datetime import timedelta
from io import BytesIO
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook

from core.models import Election, Student, Position, Candidate, Vote

User = get_user_model()


class StaffPermissionTestCase(TestCase):
    """Test staff user permissions are correctly scoped to their assigned election."""

    def setUp(self):
        """Set up test data with two elections and users with different roles."""
        now = timezone.now()
        next_week = now + timedelta(days=7)

        # Create two elections
        self.election1 = Election.objects.create(
            name="Election 1",
            year=2024,
            start_time=now,
            end_time=next_week,
            is_active=False
        )
        self.election2 = Election.objects.create(
            name="Election 2",
            year=2024,
            start_time=now,
            end_time=next_week,
            is_active=False
        )

        # Create superuser
        self.superuser = User.objects.create_superuser(
            username="superuser",
            email="super@test.com",
            password="superpass123"
        )

        # Create staff user assigned to election 1
        self.staff1 = User.objects.create_user(
            username="staff1",
            email="staff1@test.com",
            password="staffpass123",
            role="staff",
            assigned_election=self.election1
        )

        # Create staff user assigned to election 2
        self.staff2 = User.objects.create_user(
            username="staff2",
            email="staff2@test.com",
            password="staffpass123",
            role="staff",
            assigned_election=self.election2
        )

        # Create activator user assigned to election 1
        self.activator1 = User.objects.create_user(
            username="activator1",
            email="activator1@test.com",
            password="activatorpass123",
            role="activator",
            assigned_election=self.election1
        )

        # Create students for both elections
        self.student1_election1 = Student.objects.create(
            student_id="S001",
            full_name="Student One",
            class_name="Class A",
            election=self.election1,
            is_active=False,
            has_voted=False
        )
        self.student2_election1 = Student.objects.create(
            student_id="S002",
            full_name="Student Two",
            class_name="Class A",
            election=self.election1,
            is_active=False,
            has_voted=False
        )
        self.student1_election2 = Student.objects.create(
            student_id="S003",
            full_name="Student Three",
            class_name="Class B",
            election=self.election2,
            is_active=False,
            has_voted=False
        )

        # Create positions for both elections
        self.position1_election1 = Position.objects.create(
            name="President",
            election=self.election1,
            display_order=1
        )
        self.position1_election2 = Position.objects.create(
            name="President",
            election=self.election2,
            display_order=1
        )

        # Create candidates for both elections
        self.candidate1_election1 = Candidate.objects.create(
            student=self.student1_election1,
            position=self.position1_election1,
            ballot_number=1
        )
        self.candidate1_election2 = Candidate.objects.create(
            student=self.student1_election2,
            position=self.position1_election2,
            ballot_number=1
        )

        # Set up API clients
        self.superuser_client = self._get_authenticated_client(self.superuser)
        self.staff1_client = self._get_authenticated_client(self.staff1)
        self.staff2_client = self._get_authenticated_client(self.staff2)
        self.activator1_client = self._get_authenticated_client(self.activator1)

    def _get_authenticated_client(self, user):
        """Create an authenticated API client for a user."""
        client = APIClient()
        refresh = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        return client

    def test_staff_can_only_view_assigned_election(self):
        """Staff users should only see their assigned election."""
        # Staff1 assigned to election1 should only see election1
        response = self.staff1_client.get('/api/elections/')
        self.assertEqual(response.status_code, 200)
        election_ids = [e['id'] for e in response.data]
        self.assertEqual(len(election_ids), 1)
        self.assertIn(self.election1.id, election_ids)
        self.assertNotIn(self.election2.id, election_ids)

        # Staff2 assigned to election2 should only see election2
        response = self.staff2_client.get('/api/elections/')
        self.assertEqual(response.status_code, 200)
        election_ids = [e['id'] for e in response.data]
        self.assertEqual(len(election_ids), 1)
        self.assertIn(self.election2.id, election_ids)
        self.assertNotIn(self.election1.id, election_ids)

        # Superuser should see all elections
        response = self.superuser_client.get('/api/elections/')
        self.assertEqual(response.status_code, 200)
        election_ids = [e['id'] for e in response.data]
        self.assertEqual(len(election_ids), 2)
        self.assertIn(self.election1.id, election_ids)
        self.assertIn(self.election2.id, election_ids)

    def test_staff_can_add_voters_to_assigned_election(self):
        """Staff users should be able to add voters to their assigned election."""
        # Staff1 can add student to election1
        response = self.staff1_client.post('/api/students/', {
            'student_id': 'S004',
            'full_name': 'New Student',
            'class_name': 'Class A',
            'election_id': self.election1.id
        })
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Student.objects.filter(
            student_id='S004',
            election=self.election1
        ).exists())

        # Staff1 cannot add student to election2 (will fail due to scoping)
        response = self.staff1_client.post('/api/students/', {
            'student_id': 'S005',
            'full_name': 'Another Student',
            'class_name': 'Class B',
            'election_id': self.election2.id
        })
        # The serializer will validate the election exists, but the view's perform_create
        # will check scope and raise ParseError
        self.assertIn(response.status_code, [400, 404])
        self.assertFalse(Student.objects.filter(
            student_id='S005',
            election=self.election2
        ).exists())

    def test_staff_can_only_view_voters_in_assigned_election(self):
        """Staff users should only see voters in their assigned election."""
        # Staff1 should only see students in election1
        response = self.staff1_client.get('/api/students/')
        self.assertEqual(response.status_code, 200)
        student_ids = [s['id'] for s in response.data]
        self.assertIn(self.student1_election1.id, student_ids)
        self.assertIn(self.student2_election1.id, student_ids)
        self.assertNotIn(self.student1_election2.id, student_ids)

    def test_staff_can_add_candidates_to_assigned_election(self):
        """Staff users should be able to add candidates to their assigned election."""
        # Create a new student for testing
        new_student = Student.objects.create(
            student_id='S010',
            full_name='Candidate Student',
            class_name='Class A',
            election=self.election1,
            is_active=False,
            has_voted=False
        )

        # Staff1 can add candidate to position in election1
        response = self.staff1_client.post('/api/candidates/create/', {
            'student': new_student.id,
            'position': self.position1_election1.id,
            'ballot_number': 2
        })
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Candidate.objects.filter(
            student=new_student,
            position=self.position1_election1
        ).exists())

        # Staff1 cannot add candidate to position in election2
        response = self.staff1_client.post('/api/candidates/create/', {
            'student': self.student1_election2.id,
            'position': self.position1_election2.id,
            'ballot_number': 2
        })
        self.assertEqual(response.status_code, 404)

    def test_staff_can_create_positions_in_assigned_election(self):
        """Staff users should be able to create positions in their assigned election."""
        # Staff1 can create position in election1
        response = self.staff1_client.post('/api/positions/create/', {
            'name': 'Vice President',
            'election': self.election1.id,
            'display_order': 2
        })
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Position.objects.filter(
            name='Vice President',
            election=self.election1
        ).exists())

        # Staff1 cannot create position in election2 will fail due to scoping
        response = self.staff1_client.post('/api/positions/create/', {
            'name': 'Secretary',
            'election': self.election2.id,
            'display_order': 2
        })
        self.assertEqual(response.status_code, 404)

    def test_staff_can_start_stop_assigned_election(self):
        """Staff users should be able to start/stop their assigned election."""
        # Staff1 can change election1 status
        for request_format in ('json', 'multipart'):
            for new_state in (True, False):
                with self.subTest(format=request_format, is_active=new_state):
                    response = self.staff1_client.patch('/api/elections/manage/', {
                        'election_id': self.election1.id,
                        'is_active': new_state
                    }, format=request_format)
                    self.assertEqual(response.status_code, 200)
                    self.election1.refresh_from_db()
                    self.assertEqual(self.election1.is_active, new_state)
                    self.assertEqual(response.data['is_active'], new_state)

        # Staff1 cannot start/stop election2
        response = self.staff1_client.patch('/api/elections/manage/', {
            'election_id': self.election2.id,
            'is_active': True
        })
        self.assertEqual(response.status_code, 404)

    def test_staff_can_activate_and_deactivate_only_assigned_voters(self):
        self.election1.is_active = True
        self.election1.save(update_fields=['is_active'])
        for request_format in ('json', 'multipart'):
            for active in (True, False):
                with self.subTest(format=request_format, active=active):
                    response = self.staff1_client.post('/api/students/activate/', {
                        'student_id': self.student1_election1.student_id,
                        'election_id': self.election1.id,
                        'is_active': active,
                    }, format=request_format)
                    self.assertEqual(response.status_code, 200)
                    self.student1_election1.refresh_from_db()
                    self.assertEqual(self.student1_election1.is_active, active)

        response = self.staff1_client.post('/api/students/activate/', {
            'student_id': self.student1_election2.student_id,
            'election_id': self.election2.id,
            'is_active': True,
        }, format='json')
        self.assertEqual(response.status_code, 404)
        self.student1_election2.refresh_from_db()
        self.assertFalse(self.student1_election2.is_active)

    def test_invalid_status_values_are_rejected_without_changes(self):
        for value in ('invalid', [], {}, 2):
            with self.subTest(value=value):
                response = self.staff1_client.patch('/api/elections/manage/', {
                    'election_id': self.election1.id, 'is_active': value,
                }, format='json')
                self.assertEqual(response.status_code, 400)
                response = self.staff1_client.post('/api/students/activate/', {
                    'student_id': self.student1_election1.student_id,
                    'election_id': self.election1.id, 'is_active': value,
                }, format='json')
                self.assertEqual(response.status_code, 400)
        self.election1.refresh_from_db()
        self.student1_election1.refresh_from_db()
        self.assertFalse(self.election1.is_active)
        self.assertFalse(self.student1_election1.is_active)

    def test_staff_cannot_activate_inactive_election_or_voted_student(self):
        payload = {'student_id': self.student1_election1.student_id,
                   'election_id': self.election1.id, 'is_active': True}
        self.assertEqual(self.staff1_client.post('/api/students/activate/', payload, format='json').status_code, 403)
        self.election1.is_active = True
        self.election1.save(update_fields=['is_active'])
        self.student1_election1.has_voted = True
        self.student1_election1.save(update_fields=['has_voted'])
        self.assertEqual(self.staff1_client.post('/api/students/activate/', payload, format='json').status_code, 403)

    def test_activator_cannot_manage_elections_positions_or_results(self):
        for method, url, payload in (
            ('patch', '/api/elections/manage/', {'election_id': self.election1.id, 'is_active': True}),
            ('post', '/api/positions/create/', {'election': self.election1.id, 'name': 'Secretary', 'display_order': 2}),
            ('get', f'/api/elections/{self.election1.id}/results/', {}),
        ):
            with self.subTest(url=url):
                response = getattr(self.activator1_client, method)(url, payload, format='json')
                self.assertEqual(response.status_code, 403)

    def test_activator_can_activate_voters_in_assigned_election(self):
        """Activator users should be able to activate voters in their assigned election."""
        # First activate the election (activators cannot do this, so use superuser)
        response = self.superuser_client.patch('/api/elections/manage/', {
            'election_id': self.election1.id,
            'is_active': True
        })
        self.assertEqual(response.status_code, 200)

        # Activator1 can activate student in election1
        response = self.activator1_client.post('/api/students/activate/', {
            'student_id': self.student1_election1.student_id,
            'election_id': self.election1.id,
            'is_active': True
        })
        self.assertEqual(response.status_code, 200)
        self.student1_election1.refresh_from_db()
        self.assertTrue(self.student1_election1.is_active)

        # Activator1 cannot activate student in election2 (wrong election)
        response = self.activator1_client.post('/api/students/activate/', {
            'student_id': self.student1_election2.student_id,
            'election_id': self.election2.id,
            'is_active': True
        })
        self.assertEqual(response.status_code, 404)
        self.student1_election2.refresh_from_db()
        self.assertFalse(self.student1_election2.is_active)

    def test_staff_can_view_results_for_assigned_election(self):
        """Staff users should be able to view results for their assigned election."""
        # Create some votes for testing
        Vote.objects.create(
            election=self.election1,
            position=self.position1_election1,
            candidate=self.candidate1_election1,
            voter_hash="test_hash_1"
        )

        # Staff1 can view results for election1
        response = self.staff1_client.get(f'/api/elections/{self.election1.id}/results/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['election_id'], self.election1.id)

        # Staff1 cannot view results for election2
        response = self.staff1_client.get(f'/api/elections/{self.election2.id}/results/')
        self.assertEqual(response.status_code, 404)

    def test_staff_cannot_access_other_elections_positions(self):
        """Staff users should not be able to access positions from other elections."""
        # Staff1 should only see positions in election1
        response = self.staff1_client.get('/api/positions/', {
            'election_id': self.election1.id
        })
        self.assertEqual(response.status_code, 200)
        position_ids = [p['id'] for p in response.data]
        self.assertIn(self.position1_election1.id, position_ids)
        self.assertNotIn(self.position1_election2.id, position_ids)

    def test_staff_cannot_access_other_elections_candidates(self):
        """Staff users should not be able to access candidates from other elections."""
        # Staff1 should only see candidates in election1
        response = self.staff1_client.get('/api/candidates/', {
            'position_id': self.position1_election1.id
        })
        self.assertEqual(response.status_code, 200)
        candidate_ids = [c['id'] for c in response.data]
        self.assertIn(self.candidate1_election1.id, candidate_ids)
        self.assertNotIn(self.candidate1_election2.id, candidate_ids)

    def test_bulk_upload_respects_election_scope(self):
        """Bulk upload should respect staff election scope."""
        workbook = Workbook()
        workbook.active.append(['student_id', 'full_name', 'class_name'])
        workbook.active.append(['IMPORTED', 'Imported Voter', 'Form 1'])
        content = BytesIO()
        workbook.save(content)
        for election, expected in ((self.election1, 201), (self.election2, 404)):
            with self.subTest(election=election.id):
                upload = SimpleUploadedFile('voters.xlsx', content.getvalue(),
                    content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                response = self.staff1_client.post('/api/students/bulk-upload/', {
                    'file': upload, 'election_id': election.id,
                }, format='multipart')
                self.assertEqual(response.status_code, expected)
        self.assertTrue(Student.objects.filter(student_id='IMPORTED', election=self.election1).exists())
        self.assertFalse(Student.objects.filter(student_id='IMPORTED', election=self.election2).exists())
