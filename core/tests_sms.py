import json
from datetime import timedelta
from unittest.mock import Mock, patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Candidate, Election, Position, Student, User, VoterSMSAttempt
from .serializers import StudentSerializer
from .sms.mnotify import MNotifySMSClient, normalize_ghana_phone_number
from .sms.services import SMSResult
from .utils import deactivate_expired_voters, verify_voter_pin


class FakeResponse:
    status = 200

    def __init__(self, payload):
        self.payload = payload

    def read(self, _limit):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


@override_settings(
    SMS_ENABLED=True,
    SMS_PROVIDER="mnotify",
    MNOTIFY_API_KEY="test-key",
    MNOTIFY_SENDER_ID="EVOTING",
    MNOTIFY_BASE_URL="https://mnotify.example",
    MNOTIFY_TIMEOUT_SECONDS=9,
)
class MNotifySMSClientTests(TestCase):
    def test_normalizes_ghana_numbers(self):
        self.assertEqual(normalize_ghana_phone_number("024 123 4567"), "+233241234567")
        self.assertEqual(normalize_ghana_phone_number("00233241234567"), "+233241234567")

    def test_sends_mnotify_quick_sms_payload(self):
        opener = Mock(return_value=FakeResponse({
            "status": "success",
            "summary": {"_id": "campaign-123", "total_rejected": 0},
        }))

        result = MNotifySMSClient(opener=opener).send(
            recipient="0241234567",
            message="Your voter PIN is 12345678.",
        )

        self.assertTrue(result.success)
        self.assertEqual(result.message_id, "campaign-123")
        request = opener.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(payload["recipient"], ["+233241234567"])
        self.assertEqual(payload["sender"], "EVOTING")
        self.assertEqual(opener.call_args.kwargs["timeout"], 9)

    def test_provider_rejection_is_structured(self):
        opener = Mock(return_value=FakeResponse({
            "status": "error",
            "error": {"code": "BAD_REQUEST", "message": "Invalid recipient"},
        }))

        result = MNotifySMSClient(opener=opener).send(
            recipient="0241234567",
            message="Your voter PIN is 12345678.",
        )

        self.assertFalse(result.success)
        self.assertEqual(result.error_category, "provider_rejected")
        self.assertEqual(result.provider_error_code, "BAD_REQUEST")


class SmsVoterFlowTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.election = Election.objects.create(
            name="SMS Election",
            year=2026,
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(hours=1),
            voting_enabled=True,
            voter_login_mode=Election.VOTER_LOGIN_MODE_SMS,
        )
        self.student = Student.objects.create(
            student_id="SMS001",
            full_name="SMS Voter",
            class_name="Form 1",
            phone_number="+233241234567",
            election=self.election,
        )
        position = Position.objects.create(
            name="President",
            election=self.election,
            display_order=1,
        )
        Candidate.objects.create(
            student=self.student,
            position=position,
            ballot_number=1,
        )
        self.user = User.objects.create_superuser(
            username="sms-admin",
            email="sms@example.com",
            password="password123",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_sms_election_requires_phone_number(self):
        serializer = StudentSerializer(data={
            "student_id": "SMS002",
            "full_name": "No Phone",
            "class_name": "Form 1",
            "election_id": self.election.id,
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn("phone_number", serializer.errors)

    def test_sms_pin_cleanup_uses_one_hour_ttl(self):
        created_at = timezone.now() - timedelta(minutes=30)
        self.student.is_active = True
        self.student.voting_pin_created_at = created_at
        self.student.save(update_fields=["is_active", "voting_pin_created_at"])

        self.assertEqual(deactivate_expired_voters(now=timezone.now()), 0)
        self.assertEqual(
            deactivate_expired_voters(now=created_at + timedelta(hours=1)),
            1,
        )

    @override_settings(
        SMS_ENABLED=True,
        SMS_PROVIDER="mnotify",
        MNOTIFY_API_KEY="test-key",
        MNOTIFY_SENDER_ID="EVOTING",
        MNOTIFY_BASE_URL="https://mnotify.example",
        MNOTIFY_TIMEOUT_SECONDS=9,
    )
    @patch("core.sms_views.send_sms")
    def test_send_sms_pins_activates_voter_and_records_attempt(self, send_sms):
        send_sms.return_value = SMSResult(
            success=True,
            provider="mnotify",
            message_id="campaign-1",
            http_status=200,
        )

        response = self.client.post(
            "/api/students/send-sms-pins/",
            {"election_id": self.election.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sent"], 1)
        self.assertEqual(response.data["failed"], 0)
        self.student.refresh_from_db()
        self.assertTrue(self.student.is_active)
        self.assertTrue(self.student.voting_pin_hash)
        self.assertEqual(
            VoterSMSAttempt.objects.values_list("status", flat=True).get(),
            VoterSMSAttempt.Status.SENT,
        )
        send_sms.assert_called_once()
        self.assertEqual(send_sms.call_args.kwargs["recipient"], "+233241234567")
        self.assertIn("SMS Election", send_sms.call_args.kwargs["message"])
        self.assertEqual(len(send_sms.call_args.kwargs["message"].split("PIN is ")[1].split(".")[0]), 8)
        self.assertTrue(verify_voter_pin(send_sms.call_args.kwargs["message"].split("PIN is ")[1].split(".")[0], self.student.voting_pin_hash))

    @override_settings(
        SMS_ENABLED=True,
        SMS_PROVIDER="mnotify",
        MNOTIFY_API_KEY="test-key",
        MNOTIFY_SENDER_ID="EVOTING",
        MNOTIFY_BASE_URL="https://mnotify.example",
        MNOTIFY_TIMEOUT_SECONDS=9,
    )
    @patch("core.sms_views.send_sms")
    def test_valid_sms_pin_is_not_sent_again(self, send_sms):
        send_sms.return_value = SMSResult(
            success=True,
            provider="mnotify",
            message_id="campaign-1",
            http_status=200,
        )

        first_response = self.client.post(
            "/api/students/send-sms-pins/",
            {"election_id": self.election.id},
            format="json",
        )
        second_response = self.client.post(
            "/api/students/send-sms-pins/",
            {"election_id": self.election.id},
            format="json",
        )

        self.assertEqual(first_response.data["sent"], 1)
        self.assertEqual(second_response.data["sent"], 0)
        self.assertEqual(second_response.data["skipped_valid_pin"], 1)
        self.assertEqual(second_response.data["eligible"], 1)
        self.assertEqual(send_sms.call_count, 1)
        self.assertEqual(
            VoterSMSAttempt.objects.filter(status=VoterSMSAttempt.Status.SKIPPED).count(),
            1,
        )

    @override_settings(
        SMS_ENABLED=True,
        SMS_PROVIDER="mnotify",
        MNOTIFY_API_KEY="test-key",
        MNOTIFY_SENDER_ID="EVOTING",
        MNOTIFY_BASE_URL="https://mnotify.example",
        MNOTIFY_TIMEOUT_SECONDS=9,
    )
    @patch("core.sms_views.send_sms")
    def test_status_table_and_resend_endpoint_follow_pin_state(self, send_sms):
        send_sms.return_value = SMSResult(
            success=True,
            provider="mnotify",
            message_id="campaign-1",
            http_status=200,
        )

        self.client.post(
            "/api/students/send-sms-pins/",
            {"election_id": self.election.id},
            format="json",
        )
        status_response = self.client.get(
            "/api/students/sms-status/",
            {"election_id": self.election.id},
        )
        row = status_response.data["results"][0]
        self.assertEqual(status_response.status_code, 200)
        self.assertEqual(row["status"], "sent")
        self.assertFalse(row["can_resend"])
        self.assertIsNotNone(row["pin_expires_at"])

        blocked_resend = self.client.post(
            "/api/students/resend-sms-pin/",
            {"election_id": self.election.id, "student_id": self.student.id},
            format="json",
        )
        self.assertEqual(blocked_resend.status_code, 409)
        self.assertEqual(send_sms.call_count, 1)

        self.student.voting_pin_created_at = timezone.now() - timedelta(hours=2)
        self.student.save(update_fields=["voting_pin_created_at"])
        expired_status = self.client.get(
            "/api/students/sms-status/",
            {"election_id": self.election.id},
        )
        expired_row = expired_status.data["results"][0]
        self.assertEqual(expired_row["status"], "expired")
        self.assertTrue(expired_row["can_resend"])

        resend_response = self.client.post(
            "/api/students/resend-sms-pin/",
            {"election_id": self.election.id, "student_id": self.student.id},
            format="json",
        )
        self.assertEqual(resend_response.status_code, 200)
        self.assertEqual(send_sms.call_count, 2)
    @patch('core.sms_views.send_sms')
    def test_generate_sms_pin_creates_manual_fallback_without_sending(self, send_sms):
        response = self.client.post(
            '/api/students/generate-sms-pin/',
            {'election_id': self.election.id, 'student_id': self.student.id},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'generated')
        pin = response.data['voting_pin']
        self.assertEqual(len(pin), 8)
        self.assertTrue(pin.isdigit())
        send_sms.assert_not_called()

        self.student.refresh_from_db()
        self.assertTrue(self.student.is_active)
        self.assertTrue(verify_voter_pin(pin, self.student.voting_pin_hash))
        self.assertEqual(
            VoterSMSAttempt.objects.values_list('status', flat=True).get(),
            VoterSMSAttempt.Status.GENERATED,
        )

        status_response = self.client.get(
            '/api/students/sms-status/',
            {'election_id': self.election.id},
        )
        self.assertEqual(status_response.status_code, 200)
        row = status_response.data['results'][0]
        self.assertEqual(row['status'], 'generated')
        self.assertFalse(row['can_resend'])
        self.assertIsNotNone(row['pin_expires_at'])
    def test_status_tables_are_database_paginated_and_searchable(self):
        Student.objects.bulk_create([
            Student(
                student_id=f"PAGE{i:03}",
                full_name=f"Paginated Voter {i:03}",
                class_name="Form 1",
                phone_number=f"+2332412345{i:02}",
                election=self.election,
            )
            for i in range(11)
        ])

        first_page = self.client.get(
            "/api/students/sms-status/",
            {"election_id": self.election.id, "page": 1},
        )
        second_page = self.client.get(
            "/api/students/sms-status/",
            {"election_id": self.election.id, "page": 2},
        )
        self.assertEqual(first_page.status_code, 200)
        self.assertEqual(first_page.data["count"], 12)
        self.assertEqual(len(first_page.data["results"]), 10)
        self.assertIsNotNone(first_page.data["next"])
        self.assertEqual(len(second_page.data["results"]), 2)
        self.assertIsNone(second_page.data["next"])
        self.assertIsNotNone(second_page.data["previous"])

        searched = self.client.get(
            "/api/students/sms-status/",
            {"election_id": self.election.id, "search": "PAGE010"},
        )
        self.assertEqual(searched.data["count"], 1)
        self.assertEqual(searched.data["results"][0]["student_id"], "PAGE010")

        recovery_page = self.client.get(
            "/api/students/recovery-status/",
            {"election_id": self.election.id, "page": 2},
        )
        self.assertEqual(recovery_page.status_code, 200)
        self.assertEqual(recovery_page.data["count"], 12)
        self.assertEqual(len(recovery_page.data["results"]), 2)

        recovery_search = self.client.get(
            "/api/students/recovery-status/",
            {"election_id": self.election.id, "search": "PAGE010"},
        )
        self.assertEqual(recovery_search.data["count"], 1)
        self.assertEqual(recovery_search.data["results"][0]["student_id"], "PAGE010")
