from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from .models import Election, Student
from .utils import VOTER_PIN_TTL, hash_voter_pin


class ExpireVoterPinsCommandTests(TestCase):
    def test_command_deactivates_only_expired_active_voters(self):
        now = timezone.now()
        election = Election.objects.create(
            name="PIN expiry test",
            year=2099,
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(minutes=5),
            voting_enabled=True,
        )
        expired = Student.objects.create(
            student_id="EXPIRED",
            full_name="Expired Voter",
            class_name="Form 1",
            election=election,
            is_active=True,
            voting_pin_hash=hash_voter_pin("12345678"),
            voting_pin_created_at=now - VOTER_PIN_TTL - timedelta(seconds=1),
            voting_pin_attempts=2,
        )
        current = Student.objects.create(
            student_id="CURRENT",
            full_name="Current Voter",
            class_name="Form 1",
            election=election,
            is_active=True,
            voting_pin_hash=hash_voter_pin("12345678"),
            voting_pin_created_at=now - VOTER_PIN_TTL + timedelta(seconds=1),
        )
        session_expired = Student.objects.create(
            student_id="SESSION-EXPIRED",
            full_name="Expired Session",
            class_name="Form 1",
            election=election,
            is_active=True,
            voter_session_expires_at=now - timedelta(seconds=1),
        )
        voted = Student.objects.create(
            student_id="VOTED",
            full_name="Voted Voter",
            class_name="Form 1",
            election=election,
            is_active=True,
            has_voted=True,
            voting_pin_hash=hash_voter_pin("12345678"),
            voting_pin_created_at=now - VOTER_PIN_TTL - timedelta(seconds=1),
        )

        call_command("expire_voter_pins", stdout=StringIO())

        expired.refresh_from_db()
        current.refresh_from_db()
        voted.refresh_from_db()
        session_expired.refresh_from_db()
        self.assertFalse(expired.is_active)
        self.assertEqual(expired.voting_pin_hash, "")
        self.assertIsNone(expired.voting_pin_created_at)
        self.assertEqual(expired.voting_pin_attempts, 0)
        self.assertFalse(session_expired.is_active)
        self.assertIsNone(session_expired.voter_session_expires_at)
        self.assertTrue(current.is_active)
        self.assertTrue(voted.is_active)
