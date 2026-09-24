from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from .models import Candidate, Election, Position, Student, User
from .utils import create_voter_token


class ElectionIsolationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.election_one = Election.objects.create(
            name="Election One",
            year=2026,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
            voting_enabled=True,
        )
        self.election_two = Election.objects.create(
            name="Election Two",
            year=2027,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
            voting_enabled=True,
        )
        self.superuser = User.objects.create_superuser(
            username="isolation-superuser", password="password123"
        )
        self.staff = User.objects.create_user(
            username="isolation-staff",
            password="password123",
            role="staff",
            assigned_election=self.election_one,
        )
        self.activator = User.objects.create_user(
            username="isolation-activator",
            password="password123",
            role="activator",
            assigned_election=self.election_two,
        )
        self.student_one = Student.objects.create(
            student_id="S-ONE",
            full_name="Student One",
            class_name="A",
            election=self.election_one,
        )
        self.student_two = Student.objects.create(
            student_id="S-TWO",
            full_name="Student Two",
            class_name="B",
            election=self.election_two,
        )
        self.position_one = Position.objects.create(
            name="President One", election=self.election_one, display_order=1
        )
        self.position_two = Position.objects.create(
            name="President Two", election=self.election_two, display_order=1
        )
        self.candidate_one = Candidate.objects.create(
            student=self.student_one, position=self.position_one, ballot_number=1
        )
        self.candidate_two = Candidate.objects.create(
            student=self.student_two, position=self.position_two, ballot_number=1
        )

    def test_unauthenticated_data_endpoints_are_denied(self):
        requests = [
            self.client.get("/api/elections/"),
            self.client.get(f"/api/elections/{self.election_one.id}/"),
            self.client.get("/api/students/"),
            self.client.get(f"/api/positions/?election_id={self.election_one.id}"),
            self.client.get(f"/api/candidates/?position_id={self.position_one.id}"),
            self.client.get(f"/api/elections/{self.election_one.id}/stats/"),
            self.client.get(f"/api/elections/{self.election_one.id}/results/"),
            self.client.get("/api/users/"),
        ]
        self.assertTrue(all(response.status_code in {401, 403} for response in requests))

    def test_superuser_can_access_both_elections(self):
        self.client.force_authenticate(self.superuser)

        elections = self.client.get("/api/elections/")
        students = self.client.get("/api/students/")
        positions = self.client.get("/api/positions/")

        self.assertEqual(elections.status_code, 200)
        self.assertEqual({item["id"] for item in elections.data}, {
            self.election_one.id, self.election_two.id
        })
        self.assertEqual({item["id"] for item in students.data}, {
            self.student_one.id, self.student_two.id
        })
        self.assertEqual({item["id"] for item in positions.data}, {
            self.position_one.id, self.position_two.id
        })

    def test_staff_isolated_from_other_election(self):
        self.client.force_authenticate(self.staff)

        self.assertEqual(self.client.get("/api/elections/").data[0]["id"], self.election_one.id)
        self.assertEqual(
            self.client.get("/api/students/").data[0]["id"], self.student_one.id
        )
        self.assertEqual(
            self.client.get(f"/api/positions/{self.position_two.id}/").status_code, 404
        )
        self.assertEqual(
            self.client.get(f"/api/candidates/{self.candidate_two.id}/").status_code, 404
        )
        self.assertEqual(
            self.client.get(f"/api/elections/{self.election_two.id}/stats/").status_code, 404
        )
        self.assertEqual(
            self.client.get(f"/api/elections/{self.election_two.id}/results/").status_code, 404
        )

    def test_activator_isolated_and_retains_read_only_student_permission(self):
        self.client.force_authenticate(self.activator)

        students = self.client.get("/api/students/")
        self.assertEqual(students.status_code, 200)
        self.assertEqual(students.data[0]["id"], self.student_two.id)
        self.assertEqual(
            self.client.get(f"/api/students/?election_id={self.election_one.id}").data, []
        )
        self.assertEqual(
            self.client.post(
                "/api/students/",
                {
                    "student_id": "S-NEW",
                    "full_name": "New Student",
                    "class_name": "C",
                    "election_id": self.election_two.id,
                },
                format="json",
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.get(f"/api/elections/{self.election_one.id}/stats/").status_code,
            403,
        )

    def test_related_ids_and_request_bodies_cannot_cross_scope(self):
        self.client.force_authenticate(self.staff)

        student = self.client.post(
            "/api/students/",
            {
                "student_id": "S-CROSS",
                "full_name": "Cross Election",
                "class_name": "C",
                "election_id": self.election_two.id,
            },
            format="json",
        )
        position = self.client.post(
            "/api/positions/create/",
            {"name": "Cross Position", "election": self.election_two.id, "display_order": 2},
            format="json",
        )
        candidate = self.client.post(
            "/api/candidates/create/",
            {
                "student": self.student_one.id,
                "position": self.position_two.id,
                "ballot_number": 2,
            },
            format="json",
        )

        self.assertEqual(student.status_code, 404)
        self.assertEqual(position.status_code, 404)
        self.assertEqual(candidate.status_code, 404)

    def test_voter_headers_scope_ballot_read_endpoints(self):
        headers = {
            "HTTP_X_STUDENT_ID": self.student_one.student_id,
            "HTTP_X_ELECTION_ID": str(self.election_one.id),
            "HTTP_X_VOTER_TOKEN": create_voter_token(
                f"{self.student_one.student_id}_{self.election_one.id}"
            ),
        }

        positions = self.client.get(
            f"/api/positions/?election_id={self.election_one.id}", **headers
        )
        candidates = self.client.get(
            f"/api/candidates/?position_id={self.position_one.id}", **headers
        )
        other_positions = self.client.get(
            f"/api/positions/?election_id={self.election_two.id}", **headers
        )
        other_candidates = self.client.get(
            f"/api/candidates/?position_id={self.position_two.id}", **headers
        )

        self.assertEqual(positions.status_code, 200)
        self.assertEqual(candidates.status_code, 200)
        self.assertEqual([item["id"] for item in positions.data], [self.position_one.id])
        self.assertEqual([item["id"] for item in candidates.data], [self.candidate_one.id])
        self.assertEqual(other_positions.data, [])
        self.assertEqual(other_candidates.data, [])

    def test_cross_scope_updates_deletes_activation_and_position_stats_are_rejected(self):
        self.client.force_authenticate(self.staff)

        self.assertEqual(
            self.client.patch(
                f"/api/positions/{self.position_two.id}/",
                {"name": "Should not change"},
                format="json",
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.delete(f"/api/candidates/{self.candidate_two.id}/").status_code,
            404,
        )
        self.assertEqual(
            self.client.get(
                f"/api/votes/position-stats/?position_id={self.position_two.id}"
            ).status_code,
            404,
        )

        self.client.force_authenticate(self.activator)
        activation = self.client.post(
            "/api/students/activate/",
            {
                "student_id": self.student_one.student_id,
                "election_id": self.election_one.id,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(activation.status_code, 404)

    def test_bulk_import_cannot_target_another_election(self):
        self.client.force_authenticate(self.staff)
        upload = SimpleUploadedFile(
            "students.xlsx", b"not a workbook", content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response = self.client.post(
            "/api/students/bulk-upload/",
            {"file": upload, "election_id": self.election_two.id},
            format="multipart",
        )
        self.assertEqual(response.status_code, 404)

    def test_staff_cannot_create_global_election(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            "/api/elections/create/",
            {
                "name": "Out of scope election",
                "year": 2028,
                "start_time": timezone.now(),
                "end_time": timezone.now() + timedelta(hours=1),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)
