from datetime import timedelta

from django.utils import timezone
from django.urls import reverse
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Election, Position, Candidate, Student, Vote, User
from .utils import make_voter_hmac
from openpyxl import Workbook
from io import BytesIO


class MultiVoteViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        now = timezone.now()
        self.election = Election.objects.create(
            name="General",
            year=2025,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
            is_active=True,
        )
        self.position1 = Position.objects.create(
            name="President", election=self.election, display_order=1
        )
        self.position2 = Position.objects.create(
            name="VP", election=self.election, display_order=2
        )
        # Create students with election_id for composite constraint
        self.student = Student.objects.create(
            student_id="S001", full_name="Alice", class_name="A1", is_active=True, election=self.election
        )
        self.candidate1 = Candidate.objects.create(
            student=self.student, position=self.position1
        )
        # Separate student for second candidate to avoid OneToOne conflict
        self.student_b = Student.objects.create(
            student_id="S002", full_name="Bob", class_name="A1", is_active=True, election=self.election
        )
        self.candidate2 = Candidate.objects.create(
            student=self.student_b, position=self.position2
        )

        token = make_voter_hmac(self.student.student_id)
        self.headers = {
            "HTTP_X_STUDENT_ID": self.student.student_id,
            "HTTP_X_VOTER_TOKEN": token,
        }

    def test_happy_path_creates_votes_and_locks_student(self):
        payload = {
            "votes": [
                {
                    "election": self.election.id,
                    "position": self.position1.id,
                    "candidate": self.candidate1.id,
                },
                {
                    "election": self.election.id,
                    "position": self.position2.id,
                    "candidate": self.candidate2.id,
                },
            ]
        }
        resp = self.client.post("/api/vote/", payload, format="json", **self.headers)
        self.assertEqual(resp.status_code, 201, resp.content)
        self.student.refresh_from_db()
        self.assertTrue(self.student.has_voted)
        self.assertFalse(self.student.is_active)
        self.assertEqual(Vote.objects.filter(voter_hash=self.headers["HTTP_X_VOTER_TOKEN"]).count(), 2)

    def test_rejects_candidate_not_in_position(self):
        payload = {
            "votes": [
                {
                    "election": self.election.id,
                    "position": self.position1.id,
                    "candidate": self.candidate2.id,  # wrong position
                }
            ]
        }
        resp = self.client.post("/api/vote/", payload, format="json", **self.headers)
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_rejects_inactive_election(self):
        self.election.is_active = False
        self.election.save(update_fields=["is_active"])
        payload = {
            "votes": [
                {
                    "election": self.election.id,
                    "position": self.position1.id,
                    "candidate": self.candidate1.id,
                }
            ]
        }
        resp = self.client.post("/api/vote/", payload, format="json", **self.headers)
        self.assertEqual(resp.status_code, 403, resp.content)


class BulkStudentUploadTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="staff", password="pass", role="staff"
        )
        self.client.force_authenticate(user=self.user)
        # Create an election for bulk upload tests
        self.election = Election.objects.create(
            name="Test Election",
            year=2025,
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=1),
            is_active=False,  # Not active for bulk upload
        )

    def _make_workbook(self, rows):
        wb = Workbook()
        ws = wb.active
        ws.append(["student_id", "full_name", "class_name"])
        for r in rows:
            ws.append(r)
        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)
        return buf

    def test_bulk_upload_creates_students(self):
        buf = self._make_workbook(
            [
                ["S100", "Alice One", "A1"],
                ["S101", "Bob Two", "A1"],
            ]
        )
        resp = self.client.post(
            "/api/students/bulk-upload/",
            {"file": buf, "election_id": self.election.id},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(Student.objects.filter(election=self.election).count(), 2)

    def test_bulk_upload_skips_existing(self):
        Student.objects.create(
            student_id="S100", 
            full_name="Existing", 
            class_name="A1", 
            election=self.election
        )
        buf = self._make_workbook(
            [
                ["S100", "Existing", "A1"],
                ["S101", "Bob Two", "A1"],
            ]
        )
        resp = self.client.post(
            "/api/students/bulk-upload/",
            {"file": buf, "election_id": self.election.id},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(Student.objects.filter(election=self.election).count(), 2)  # one pre-existing + one new
