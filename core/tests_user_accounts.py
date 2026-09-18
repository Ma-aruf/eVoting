from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Candidate, Election, Position, Student, User, Vote


class ElectionScopedUserAccountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.election = Election.objects.create(
            name="General Election",
            year=2026,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
        )
        self.other_election = Election.objects.create(
            name="Other Election",
            year=2027,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
        )
        self.admin = User.objects.create_superuser(
            username="root",
            email="root@example.com",
            password="password123",
        )
        self.client.force_authenticate(user=self.admin)

    def create_user(self, role="staff", **kwargs):
        payload = {
            "username": f"{role}-{User.objects.count()}",
            "password": "password123",
            "role": role,
            **kwargs,
        }
        return self.client.post("/api/users/", payload, format="json")

    def test_staff_creation_requires_and_returns_election(self):
        response = self.create_user(role="staff", election_id=self.election.id)

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data["assigned_election"]["id"], self.election.id)
        self.assertEqual(response.data["assigned_election"]["name"], self.election.name)
        self.assertEqual(response.data["assigned_election"]["year"], self.election.year)

    def test_activator_creation_requires_and_returns_election(self):
        response = self.create_user(role="activator", election_id=self.election.id)

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data["assigned_election"]["id"], self.election.id)

    def test_staff_creation_without_election_is_rejected(self):
        response = self.create_user(role="staff")

        self.assertEqual(response.status_code, 400)
        self.assertIn("election_id", response.data)

    def test_activator_creation_without_election_is_rejected(self):
        response = self.create_user(role="activator")

        self.assertEqual(response.status_code, 400)
        self.assertIn("election_id", response.data)

    def test_superuser_creation_requires_no_election(self):
        response = self.create_user(role="superuser")

        self.assertEqual(response.status_code, 201, response.content)
        user = User.objects.get(username=response.data["username"])
        self.assertTrue(user.is_superuser)
        self.assertIsNone(user.assigned_election_id)
        self.assertIsNone(response.data["assigned_election"])

    def test_superuser_creation_with_election_is_rejected(self):
        response = self.create_user(role="superuser", election_id=self.election.id)

        self.assertEqual(response.status_code, 400)
        self.assertIn("election_id", response.data)

    def test_invalid_election_id_is_rejected(self):
        response = self.create_user(role="staff", election_id=999999)

        self.assertEqual(response.status_code, 400)
        self.assertIn("election_id", response.data)

    def test_auth_me_returns_assigned_election(self):
        staff = User.objects.create_user(
            username="assigned-staff",
            password="password123",
            role="staff",
            assigned_election=self.election,
        )
        self.client.force_authenticate(user=staff)

        response = self.client.get("/api/auth/me/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], "staff")
        self.assertEqual(response.data["assigned_election"]["id"], self.election.id)
        self.assertEqual(response.data["assigned_election"]["name"], self.election.name)
        self.assertEqual(response.data["assigned_election"]["year"], self.election.year)

    def test_superuser_auth_me_returns_no_assigned_election(self):
        response = self.client.get("/api/auth/me/")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["role"] == "superuser")
        self.assertIsNone(response.data["assigned_election"])

    def test_election_assignment_cannot_be_changed(self):
        response = self.create_user(role="staff", election_id=self.election.id)
        user_id = response.data["id"]

        response = self.client.patch(
            f"/api/users/{user_id}/",
            {"election_id": self.other_election.id},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("election_id", response.data)

    def test_staff_cannot_change_own_assignment(self):
        staff = User.objects.create_user(
            username="limited-staff",
            password="password123",
            role="staff",
            assigned_election=self.election,
        )
        self.client.force_authenticate(user=staff)

        response = self.client.patch(
            f"/api/users/{staff.id}/",
            {"election_id": self.other_election.id},
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_invalid_role_election_combinations_are_rejected(self):
        staff_to_superuser = self.create_user(role="staff", election_id=self.election.id)
        self.assertEqual(staff_to_superuser.status_code, 201)

        response = self.client.patch(
            f"/api/users/{staff_to_superuser.data['id']}/",
            {"role": "superuser"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("role", response.data)

    def test_vote_free_election_deletes_assigned_accounts(self):
        staff = User.objects.create_user(
            username="delete-staff",
            password="password123",
            role="staff",
            assigned_election=self.election,
        )
        activator = User.objects.create_user(
            username="delete-activator",
            password="password123",
            role="activator",
            assigned_election=self.election,
        )

        self.election.delete()

        self.assertFalse(User.objects.filter(id=staff.id).exists())
        self.assertFalse(User.objects.filter(id=activator.id).exists())

    def test_election_with_votes_remains_protected(self):
        position = Position.objects.create(name="President", election=self.election, display_order=1)
        student = Student.objects.create(
            student_id="S-1",
            full_name="Voter One",
            class_name="A",
            election=self.election,
        )
        candidate = Candidate.objects.create(student=student, position=position)
        Vote.objects.create(
            election=self.election,
            position=position,
            candidate=candidate,
            voter_hash="historical-voter",
        )

        with self.assertRaises(ProtectedError):
            self.election.delete()

        self.assertTrue(Election.objects.filter(id=self.election.id).exists())

    def test_direct_model_validation_rejects_invalid_combinations(self):
        invalid_staff = User(
            username="invalid-staff",
            role="staff",
            is_superuser=False,
        )
        with self.assertRaises(ValidationError):
            invalid_staff.full_clean()

        invalid_superuser = User(
            username="invalid-superuser",
            role="superuser",
            is_superuser=False,
        )
        with self.assertRaises(ValidationError):
            invalid_superuser.full_clean()
