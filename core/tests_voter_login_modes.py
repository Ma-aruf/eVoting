from datetime import timedelta

from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import AuditLog, Candidate, Election, Position, Student, User, Vote
from .utils import VOTER_ACTIVATION_TTL, create_voter_token


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
        user, _ = User.objects.get_or_create(
            username=f"{election.voter_login_mode}-activator-{election.pk}",
            defaults={
                "role": "activator",
                "assigned_election": election,
                "is_active": True,
            },
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

    def test_newly_activated_voter_submits_on_first_attempt(self):
        election, student = self.make_election(Election.VOTER_LOGIN_MODE_ID)
        self.assertEqual(self.activate(election, student).status_code, 200)
        login = APIClient().post("/api/voter/login/", {"student_id": student.student_id}, format="json")
        self.assertEqual(login.status_code, 200, login.data)
        student.refresh_from_db()
        remaining = student.voter_session_expires_at - timezone.now()
        self.assertGreater(remaining, timedelta(minutes=9))
        self.assertLessEqual(remaining, timedelta(minutes=10))

        candidate = Candidate.objects.get(position__election=election)
        response = APIClient().post(
            "/api/vote/",
            {"votes": [{"election": election.pk, "position": candidate.position_id,
                        "candidate": candidate.pk, "choice": "yes"}]},
            format="json", HTTP_X_STUDENT_ID=student.student_id,
            HTTP_X_ELECTION_ID=str(election.pk), HTTP_X_VOTER_TOKEN=login.data["token"],
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Vote.objects.filter(election=election).count(), 1)
        self.assertIsNone(AuditLog.objects.get(action="VOTE_SUBMITTED", election=election).student_id)

    def test_session_is_valid_just_before_expiry_and_rejected_at_expiry(self):
        election, student = self.make_election(Election.VOTER_LOGIN_MODE_ID)
        student.is_active = True
        student.voter_session_expires_at = timezone.now() + timedelta(minutes=10)
        student.save(update_fields=["is_active", "voter_session_expires_at"])
        candidate = Candidate.objects.get(position__election=election)
        payload = {"votes": [{"election": election.pk, "position": candidate.position_id,
                               "candidate": candidate.pk, "choice": "yes"}]}
        headers = {
            "HTTP_X_STUDENT_ID": student.student_id,
            "HTTP_X_ELECTION_ID": str(election.pk),
            "HTTP_X_VOTER_TOKEN": create_voter_token(f"{student.student_id}_{election.pk}"),
        }
        deadline = student.voter_session_expires_at
        with patch("core.authentication.timezone.now", return_value=deadline - timedelta(microseconds=1)):
            before = APIClient().post("/api/vote/", payload, format="json", **headers)
        self.assertEqual(before.status_code, 201, before.data)

        second_election, second_student = self.make_election(Election.VOTER_LOGIN_MODE_ID)
        second_student.is_active = True
        second_student.voter_session_expires_at = timezone.now()
        second_student.save(update_fields=["is_active", "voter_session_expires_at"])
        second_candidate = Candidate.objects.get(position__election=second_election)
        second_payload = {"votes": [{"election": second_election.pk,
                                     "position": second_candidate.position_id,
                                     "candidate": second_candidate.pk, "choice": "yes"}]}
        with patch("core.authentication.timezone.now", return_value=second_student.voter_session_expires_at):
            at_deadline = APIClient().post(
                "/api/vote/", second_payload, format="json",
                HTTP_X_STUDENT_ID=second_student.student_id,
                HTTP_X_ELECTION_ID=str(second_election.pk),
                HTTP_X_VOTER_TOKEN=create_voter_token(f"{second_student.student_id}_{second_election.pk}"),
            )
        self.assertEqual(at_deadline.status_code, 403)
        self.assertIn("session has expired", at_deadline.data["detail"])

    def test_missing_session_does_not_clear_a_fresh_activation(self):
        election, student = self.make_election(Election.VOTER_LOGIN_MODE_ID)
        student.is_active = True
        student.voter_activation_expires_at = timezone.now() + VOTER_ACTIVATION_TTL
        student.save(update_fields=["is_active", "voter_activation_expires_at"])
        response = APIClient().post(
            "/api/vote/", {"votes": []}, format="json",
            HTTP_X_STUDENT_ID=student.student_id,
            HTTP_X_ELECTION_ID=str(election.pk),
            HTTP_X_VOTER_TOKEN=create_voter_token(f"{student.student_id}_{election.pk}"),
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("No active voting session", response.data["detail"])
        student.refresh_from_db()
        self.assertTrue(student.is_active)
        self.assertIsNotNone(student.voter_activation_expires_at)

    def test_reactivation_after_expiry_creates_a_new_login_window(self):
        election, student = self.make_election(Election.VOTER_LOGIN_MODE_ID)
        self.assertEqual(self.activate(election, student).status_code, 200)
        first_login = APIClient().post("/api/voter/login/", {"student_id": student.student_id}, format="json")
        self.assertEqual(first_login.status_code, 200, first_login.data)
        student.refresh_from_db()
        first_expiry = student.voter_session_expires_at

        student.voter_session_expires_at = timezone.now() - timedelta(seconds=1)
        student.save(update_fields=["voter_session_expires_at"])
        reactivation = self.activate(election, student)
        self.assertEqual(reactivation.status_code, 200, reactivation.data)
        student.refresh_from_db()
        self.assertIsNone(student.voter_session_expires_at)
        self.assertGreater(student.voter_activation_expires_at, first_expiry)

        second_login = APIClient().post("/api/voter/login/", {"student_id": student.student_id}, format="json")
        self.assertEqual(second_login.status_code, 200, second_login.data)
        student.refresh_from_db()
        self.assertGreater(student.voter_session_expires_at, timezone.now())
