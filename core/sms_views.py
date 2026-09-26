from django.conf import settings
from django.db import transaction
from django.http import Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .election_access import get_scoped_election_or_404
from .election_lifecycle import election_ballot_ready, election_status
from .models import Election, Student, VoterSMSAttempt
from .permissions import IsStaffOrSuperUser
from .sms.services import get_sms_configuration_error, send_sms
from .utils import (
    generate_voter_pin,
    hash_voter_pin,
    voter_access_expired,
    voter_pin_ttl_for_election,
)


CONFIGURATION_MESSAGES = {
    "disabled": "SMS delivery is disabled.",
    "unsupported_provider": "The configured SMS provider is not supported.",
    "missing_api_key": "The SMS provider API key is not configured.",
    "invalid_sender_id": "The SMS sender ID is missing or invalid.",
    "invalid_configuration": "The SMS provider configuration is invalid.",
}


def _student_has_valid_sms_pin(student, election, now=None):
    current_time = now or timezone.now()
    return bool(
        student.voting_pin_hash
        and student.voting_pin_created_at
        and not voter_access_expired(
            student.voting_pin_created_at,
            current_time,
            voter_pin_ttl_for_election(election),
        )
    )


def _send_sms_pin_for_student(election, student_id):
    """Send one PIN while keeping the no-replacement rule atomic per voter."""
    with transaction.atomic():
        student = Student.objects.select_for_update().get(pk=student_id)
        if student.has_voted:
            return {"outcome": "already_voted"}

        now = timezone.now()
        if _student_has_valid_sms_pin(student, election, now):
            VoterSMSAttempt.objects.create(
                student=student,
                election=election,
                provider=settings.SMS_PROVIDER,
                status=VoterSMSAttempt.Status.SKIPPED,
                error_category="valid_pin_exists",
            )
            return {"outcome": "skipped_valid_pin"}

        if not student.phone_number:
            VoterSMSAttempt.objects.create(
                student=student,
                election=election,
                provider=settings.SMS_PROVIDER,
                status=VoterSMSAttempt.Status.FAILED,
                error_category="missing_phone",
            )
            return {"outcome": "missing_phone"}

        pin = generate_voter_pin()
        result = send_sms(
            recipient=student.phone_number,
            message=(
                f"{election.name}: Your voter PIN is {pin}. "
                "Use your student ID and this PIN to vote. "
                "This PIN expires in 1 hour."
            ),
        )
        attempt_status = (
            VoterSMSAttempt.Status.SENT
            if result.success
            else (
                VoterSMSAttempt.Status.DISABLED
                if result.error_category == "disabled"
                else VoterSMSAttempt.Status.FAILED
            )
        )
        VoterSMSAttempt.objects.create(
            student=student,
            election=election,
            provider=result.provider,
            status=attempt_status,
            provider_message_id=result.message_id or "",
            error_category=result.error_category or "",
            http_status=result.http_status,
        )

        if not result.success:
            return {"outcome": "failed"}

        student.is_active = True
        student.voting_pin_hash = hash_voter_pin(pin)
        student.voting_pin_created_at = now
        student.voting_pin_attempts = 0
        student.voter_session_expires_at = None
        student.voter_activation_expires_at = None
        student.save(
            update_fields=[
                "is_active",
                "voting_pin_hash",
                "voting_pin_created_at",
                "voting_pin_attempts",
                "voter_session_expires_at",
                "voter_activation_expires_at",
            ]
        )
        return {"outcome": "sent"}


def _generate_sms_pin_for_student(election, student_id):
    with transaction.atomic():
        student = Student.objects.select_for_update().get(pk=student_id)
        if student.has_voted:
            return {'outcome': 'already_voted'}

        now = timezone.now()
        if _student_has_valid_sms_pin(student, election, now):
            VoterSMSAttempt.objects.create(
                student=student,
                election=election,
                provider='manual',
                status=VoterSMSAttempt.Status.SKIPPED,
                error_category='valid_pin_exists',
            )
            return {'outcome': 'skipped_valid_pin'}

        pin = generate_voter_pin()
        VoterSMSAttempt.objects.create(
            student=student,
            election=election,
            provider='manual',
            status=VoterSMSAttempt.Status.GENERATED,
            error_category='manual_fallback',
        )

        student.is_active = True
        student.voting_pin_hash = hash_voter_pin(pin)
        student.voting_pin_created_at = now
        student.voting_pin_attempts = 0
        student.voter_session_expires_at = None
        student.voter_activation_expires_at = None
        student.save(
            update_fields=[
                'is_active',
                'voting_pin_hash',
                'voting_pin_created_at',
                'voting_pin_attempts',
                'voter_session_expires_at',
                'voter_activation_expires_at',
            ]
        )
        return {'outcome': 'generated', 'pin': pin}

class VoterSMSSendView(APIView):
    """Send fresh voter PINs to every eligible voter in an SMS election."""

    permission_classes = [IsStaffOrSuperUser]

    def post(self, request):
        election_id = request.data.get("election_id")
        if not election_id:
            return Response(
                {"detail": "election_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            election = get_scoped_election_or_404(request.user, election_id)
        except (Election.DoesNotExist, Http404):
            return Response(
                {"detail": "Election not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if election.voter_login_mode != Election.VOTER_LOGIN_MODE_SMS:
            return Response(
                {"detail": "SMS PIN delivery is only available for SMS PIN elections."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lifecycle_status = election_status(election)
        if lifecycle_status != "open":
            return Response(
                {"detail": "Voter PINs can only be sent while voting is open."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not election_ballot_ready(election):
            return Response(
                {
                    "detail": (
                        "Add at least one position and at least one candidate to every "
                        "position before sending voter PINs."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        configuration_error = get_sms_configuration_error()
        if configuration_error:
            return Response(
                {
                    "detail": CONFIGURATION_MESSAGES.get(
                        configuration_error,
                        "SMS delivery is not configured correctly.",
                    ),
                    "code": configuration_error,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        all_students = list(
            Student.objects.filter(election=election).order_by("id")
        )
        students = [student for student in all_students if not student.has_voted]
        summary = {
            "total": len(all_students),
            "eligible": len(students),
            "sent": 0,
            "failed": 0,
            "missing_phone": 0,
            "skipped_valid_pin": 0,
            "already_voted": sum(student.has_voted for student in all_students),
        }

        for student in students:
            outcome = _send_sms_pin_for_student(election, student.pk)["outcome"]
            if outcome == "sent":
                summary["sent"] += 1
            elif outcome == "failed":
                summary["failed"] += 1
            elif outcome == "missing_phone":
                summary["missing_phone"] += 1
                summary["failed"] += 1
            elif outcome == "skipped_valid_pin":
                summary["skipped_valid_pin"] += 1
            elif outcome == "already_voted":
                summary["already_voted"] += 1

        return Response(
            {
                "detail": "Voter PIN delivery completed.",
                **summary,
            },
            status=status.HTTP_200_OK,
        )


class VoterSMSStatusView(APIView):
    """Return per-voter SMS delivery and PIN status for an SMS election."""

    permission_classes = [IsStaffOrSuperUser]

    def get(self, request):
        election_id = request.query_params.get("election_id")
        if not election_id:
            return Response(
                {"detail": "election_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            election = get_scoped_election_or_404(request.user, election_id)
        except (Election.DoesNotExist, Http404):
            return Response(
                {"detail": "Election not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if election.voter_login_mode != Election.VOTER_LOGIN_MODE_SMS:
            return Response(
                {"detail": "SMS status is only available for SMS PIN elections."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        latest_attempts = {}
        for attempt in VoterSMSAttempt.objects.filter(election=election).order_by(
            "-attempted_at", "-id"
        ):
            latest_attempts.setdefault(attempt.student_id, attempt)

        now = timezone.now()
        delivery_window_open = (
            election_status(election) == "open" and election_ballot_ready(election)
        )
        rows = []
        for student in Student.objects.filter(election=election).order_by("id"):
            latest_attempt = latest_attempts.get(student.id)
            has_valid_pin = _student_has_valid_sms_pin(student, election, now)
            pin_expires_at = None
            if student.voting_pin_created_at:
                pin_expires_at = student.voting_pin_created_at + voter_pin_ttl_for_election(election)

            if student.has_voted:
                voter_status = "voted"
            elif has_valid_pin and latest_attempt and latest_attempt.status == VoterSMSAttempt.Status.GENERATED:
                voter_status = "generated"
            elif has_valid_pin:
                voter_status = "sent"
            elif not student.phone_number:
                voter_status = "missing_phone"
            elif latest_attempt and latest_attempt.status in {
                VoterSMSAttempt.Status.FAILED,
                VoterSMSAttempt.Status.DISABLED,
            }:
                voter_status = "failed"
            elif student.voting_pin_created_at:
                voter_status = "expired"
            else:
                voter_status = "not_sent"

            rows.append(
                {
                    "id": student.id,
                    "student_id": student.student_id,
                    "full_name": student.full_name,
                    "phone_number": student.phone_number,
                    "has_voted": student.has_voted,
                    "status": voter_status,
                    "can_resend": bool(
                        delivery_window_open
                        and not student.has_voted
                        and bool(student.phone_number)
                        and not has_valid_pin
                    ),
                    "last_attempt_status": latest_attempt.status if latest_attempt else None,
                    "last_error_category": latest_attempt.error_category if latest_attempt else "",
                    "last_attempt_at": (
                        timezone.localtime(latest_attempt.attempted_at).isoformat()
                        if latest_attempt
                        else None
                    ),
                    "pin_created_at": (
                        timezone.localtime(student.voting_pin_created_at).isoformat()
                        if student.voting_pin_created_at
                        else None
                    ),
                    "pin_expires_at": (
                        timezone.localtime(pin_expires_at).isoformat()
                        if pin_expires_at
                        else None
                    ),
                }
            )

        return Response(
            {"election_id": election.id, "students": rows},
            status=status.HTTP_200_OK,
        )

class VoterSMSGenerateView(APIView):
    permission_classes = [IsStaffOrSuperUser]

    def post(self, request):
        election_id = request.data.get('election_id')
        student_id = request.data.get('student_id')
        if not election_id or not student_id:
            return Response(
                {'detail': 'election_id and student_id are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            election = get_scoped_election_or_404(request.user, election_id)
            student = Student.objects.get(pk=student_id, election=election)
        except (Election.DoesNotExist, Student.DoesNotExist, Http404):
            return Response(
                {'detail': 'Election or voter not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if election.voter_login_mode != Election.VOTER_LOGIN_MODE_SMS:
            return Response(
                {'detail': 'Manual PIN generation is only available for SMS PIN elections.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if election_status(election) != 'open':
            return Response(
                {'detail': 'Voter PINs can only be generated while voting is open.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not election_ballot_ready(election):
            return Response(
                {'detail': 'The election ballot must be ready before generating voter PINs.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        result = _generate_sms_pin_for_student(election, student.id)
        outcome = result['outcome']
        if outcome == 'generated':
            return Response(
                {
                    'detail': 'A voter PIN was generated but not sent by SMS.',
                    'status': outcome,
                    'voting_pin': result['pin'],
                },
                status=status.HTTP_200_OK,
            )
        if outcome == 'skipped_valid_pin':
            return Response(
                {'detail': 'This voter already has a valid PIN.', 'status': outcome, 'voting_pin': None},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            {'detail': 'This voter has already voted.', 'status': outcome, 'voting_pin': None},
            status=status.HTTP_409_CONFLICT,
        )

class VoterSMSResendView(APIView):
    """Resend one voter PIN, subject to the same no-replacement rule."""

    permission_classes = [IsStaffOrSuperUser]

    def post(self, request):
        election_id = request.data.get("election_id")
        student_id = request.data.get("student_id")
        if not election_id or not student_id:
            return Response(
                {"detail": "election_id and student_id are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            election = get_scoped_election_or_404(request.user, election_id)
            student = Student.objects.get(pk=student_id, election=election)
        except (Election.DoesNotExist, Student.DoesNotExist, Http404):
            return Response(
                {"detail": "Election or voter not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if election.voter_login_mode != Election.VOTER_LOGIN_MODE_SMS:
            return Response(
                {"detail": "SMS PIN delivery is only available for SMS PIN elections."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if election_status(election) != "open":
            return Response(
                {"detail": "Voter PINs can only be sent while voting is open."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not election_ballot_ready(election):
            return Response(
                {"detail": "The election ballot must be ready before sending voter PINs."},
                status=status.HTTP_403_FORBIDDEN,
            )

        configuration_error = get_sms_configuration_error()
        if configuration_error:
            return Response(
                {
                    "detail": CONFIGURATION_MESSAGES.get(
                        configuration_error,
                        "SMS delivery is not configured correctly.",
                    ),
                    "code": configuration_error,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        outcome = _send_sms_pin_for_student(election, student.id)["outcome"]
        if outcome == "sent":
            return Response(
                {"detail": "A fresh voter PIN was sent by SMS.", "status": outcome},
                status=status.HTTP_200_OK,
            )
        if outcome == "skipped_valid_pin":
            return Response(
                {"detail": "This voter already has a valid PIN.", "status": outcome},
                status=status.HTTP_409_CONFLICT,
            )
        if outcome == "already_voted":
            return Response(
                {"detail": "This voter has already voted.", "status": outcome},
                status=status.HTTP_409_CONFLICT,
            )
        if outcome == "missing_phone":
            return Response(
                {"detail": "This voter does not have a phone number.", "status": outcome},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {"detail": "The SMS provider could not deliver this PIN.", "status": outcome},
            status=status.HTTP_502_BAD_GATEWAY,
        )
