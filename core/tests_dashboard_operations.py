from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import AuditLog, Election, Student, User, VoterSMSAttempt


class ElectionOperationsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.first = Election.objects.create(
            name="First", year=2026,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1), voting_enabled=True,
            voter_login_mode=Election.VOTER_LOGIN_MODE_PIN,
        )
        self.second = Election.objects.create(
            name="Second", year=2026,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1), voting_enabled=False,
            voter_login_mode=Election.VOTER_LOGIN_MODE_SMS,
        )
        self.scheduled = Election.objects.create(
            name="Future", year=2027,
            start_time=now + timedelta(hours=1),
            end_time=now + timedelta(hours=2), voting_enabled=True,
        )
        self.superuser = User.objects.create_superuser(
            username="operations-admin", password="password123"
        )
        self.staff = User.objects.create_user(
            username="operations-staff", password="password123",
            role="staff", assigned_election=self.first,
        )
        self.activator = User.objects.create_user(
            username="operations-activator", password="password123",
            role="activator", assigned_election=self.first,
        )
        Student.objects.create(
            student_id="A1", full_name="Active", class_name="A",
            election=self.first, is_active=True,
            voter_session_expires_at=now + timedelta(minutes=5),
        )
        Student.objects.create(
            student_id="A2", full_name="Voted", class_name="A",
            election=self.first, has_voted=True,
        )
        Student.objects.create(
            student_id="A3", full_name="Waiting", class_name="A",
            election=self.first,
        )
        Student.objects.create(
            student_id="A4", full_name="Expired", class_name="A",
            election=self.first, is_active=True,
            voter_session_expires_at=now - timedelta(minutes=1),
        )
        self.sms_voter = Student.objects.create(
            student_id="B1", full_name="SMS Active", class_name="B",
            election=self.second, is_active=True,
            voting_pin_created_at=now,
        )
        Student.objects.create(
            student_id="B2", full_name="SMS Waiting", class_name="B",
            election=self.second,
        )
        Student.objects.create(
            student_id="C1", full_name="Future Voter", class_name="C",
            election=self.scheduled,
        )
        AuditLog.objects.create(
            action="VOTER_LOGIN_FAILED", outcome=AuditLog.Outcome.DENIED,
            election=self.first,
        )
        AuditLog.objects.create(
            action="VOTER_AUTH_FAILED", outcome=AuditLog.Outcome.DENIED,
            election=self.first, metadata={"reason": "session_expired"},
        )
        VoterSMSAttempt.objects.create(
            student=self.sms_voter, election=self.second,
            provider="test", status=VoterSMSAttempt.Status.FAILED,
        )

    def test_superuser_sees_aggregate_and_election_breakdown(self):
        self.client.force_authenticate(self.superuser)
        response = self.client.get("/api/dashboard/operations/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual({row["id"] for row in response.data["elections"]}, {
            self.first.id, self.second.id,
        })
        self.assertEqual(response.data["totals"], {
            "total_voters": 6,
            "active_voters": 2,
            "logged_in_voters": 1,
            "voters_voted": 1,
            "yet_to_activate": 3,
            "failed_logins": 1,
            "expired_sessions": 1,
            "sms_sent": 0,
            "sms_failed": 1,
            "sms_generated": 0,
            "turnout_percentage": 16.7,
        })
        first = next(row for row in response.data["elections"] if row["id"] == self.first.id)
        self.assertEqual(first["total_voters"], 4)
        self.assertEqual(first["active_voters"], 1)
        self.assertEqual(first["turnout_percentage"], 25.0)

    def test_staff_only_sees_assigned_election(self):
        self.client.force_authenticate(self.staff)
        response = self.client.get("/api/dashboard/operations/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data["elections"]], [self.first.id])
        self.assertEqual(response.data["totals"]["total_voters"], 4)
        self.assertEqual(response.data["totals"]["sms_failed"], 0)

    def test_unauthenticated_and_activator_are_denied(self):
        self.assertIn(self.client.get("/api/dashboard/operations/").status_code, {401, 403})
        self.client.force_authenticate(self.activator)
        self.assertEqual(self.client.get("/api/dashboard/operations/").status_code, 403)
