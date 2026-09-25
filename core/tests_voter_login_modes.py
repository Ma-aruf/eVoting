from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Candidate, Election, Position, Student, User
from .utils import VOTER_ACTIVATION_TTL


class VoterLoginModeTests(TestCase):
    def make_election(self, mode):
        now = timezone.now()
        election = Election.objects.create(
            name=f"{mode} election",
            year=2099,
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(minutes=30),
            voting_enabled=True,
            voter_login_mode=mode,
        )
        position = Position.objects.create(
            name="President",
            election=election,
            display_order=1,
        )
        student = Student.objects.create(
            student_id=f"{mode}-student",
            full_name="Mode Test Voter",
            class_name="Form 1",
            election=election,
        )
        Candidate.objects.create(student=student, position=position)
        return election, student

    def activate(self, election, student):
        user = User.objects.create(
            username=f"{election.voter_login_mode}-activator",
            role="activator",
            assigned_election=election,
            is_active=True,
        )
        client = APIClient()
        client.force_authenticate(user=user)
        return client.post(
            "/api/students/activate/",
            {
                "student_id": student.student_id,
                "election_id": election.pk,
                "is_active": True,
            },
            format="json",
        )

    def test_activator_id_mode_does_not_create_a_pin_and_allows_id_login(self):
        election, student = self.make_election(Election.VOTER_LOGIN_MODE_ID)

        activation = self.activate(election, student)

        self.assertEqual(activation.status_code, 200, activation.data)
        self.assertIsNone(activation.data["voting_pin"])
        student.refresh_from_db()
        self.assertTrue(student.is_active)
        self.assertEqual(student.voting_pin_hash, "")
        self.assertIsNone(student.voting_pin_created_at)
        self.assertIsNotNone(student.voter_activation_expires_at)

        login = APIClient().post(
            "/api/voter/login/",
            {"student_id": student.student_id},
            format="json",
        )

        self.assertEqual(login.status_code, 200, login.data)
        student.refresh_from_db()
        self.assertIsNotNone(student.voter_session_expires_at)
    def test_activator_id_activation_expires_before_login(self):
        election, student = self.make_election(Election.VOTER_LOGIN_MODE_ID)

        activation = self.activate(election, student)

        self.assertEqual(activation.status_code, 200, activation.data)
        student.refresh_from_db()
        self.assertIsNotNone(student.voter_activation_expires_at)
        self.assertLessEqual(
            student.voter_activation_expires_at,
            timezone.now() + VOTER_ACTIVATION_TTL,
        )

        student.voter_activation_expires_at = timezone.now() - timedelta(seconds=1)
        student.save(update_fields=["voter_activation_expires_at"])

        login = APIClient().post(
            "/api/voter/login/",
            {"student_id": student.student_id},
            format="json",
        )

        self.assertEqual(login.status_code, 403, login.data)
        self.assertIn("activation has expired", login.data["detail"])
        student.refresh_from_db()
        self.assertFalse(student.is_active)
        self.assertIsNone(student.voter_activation_expires_at)

    def test_pin_mode_still_requires_a_pin(self):
        election, student = self.make_election(Election.VOTER_LOGIN_MODE_PIN)

        activation = self.activate(election, student)

        self.assertEqual(activation.status_code, 200, activation.data)
        self.assertEqual(len(activation.data["voting_pin"]), 8)

        login = APIClient().post(
            "/api/voter/login/",
            {"student_id": student.student_id},
            format="json",
        )

        self.assertEqual(login.status_code, 400, login.data)
        self.assertIn("8-digit voter PIN", login.data["detail"])
