from django.conf import settings
from django.db import transaction
from django.http import Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from .election_access import get_scoped_election_or_404
from .election_lifecycle import election_ballot_ready, election_lifecycle, election_status
from .models import AuditLog, Election, Student, VoterSMSAttempt
from .audit import record_audit_event
from .permissions import CanActivateVoters, IsStaffOrSuperUser
from .sms.services import get_sms_configuration_error, send_sms
from .utils import (
    generate_voter_pin,
    hash_voter_pin,
    student_has_current_voter_access,
    voter_access_expired,
    voter_pin_ttl_for_election,
    voter_session_expired,
)


CONFIGURATION_MESSAGES = {
    "disabled": "SMS delivery is disabled.",
    "unsupported_provider": "The configured SMS provider is not supported.",
    "missing_api_key": "The SMS provider API key is not configured.",
    "invalid_sender_id": "The SMS sender ID is missing or invalid.",
    "invalid_configuration": "The SMS provider configuration is invalid.",
}


class VoterRecoveryStatusView(APIView):
    permission_classes = [CanActivateVoters]

    def get(self, request):
        election_id = request.query_params.get("election_id")
        if not election_id:
            return Response({"detail": "election_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            election = get_scoped_election_or_404(request.user, election_id)
        except (Election.DoesNotExist, Http404):
            return Response({"detail": "Election not found."}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        lifecycle_status = election_lifecycle(election, now, include_candidate_lock=False)["status"]
        ballot_ready = election_ballot_ready(election)
        voters = Student.objects.filter(election=election).order_by("full_name", "id")
        search = request.query_params.get("search", "").strip()
        if search:
            from django.db.models import Q
            voters = voters.filter(
                Q(student_id__icontains=search)
                | Q(full_name__icontains=search)
                | Q(phone_number__icontains=search)
            )

        paginator = PageNumberPagination()
        paginator.page_size = 10
        voter_records = list(paginator.paginate_queryset(voters, request, view=self))
        page_ids = [student.id for student in voter_records]
        latest_attempts = {}
        for attempt in VoterSMSAttempt.objects.filter(
            election=election, student_id__in=page_ids
        ).order_by("-attempted_at", "-id"):
            latest_attempts.setdefault(attempt.student_id, attempt)
        latest_events = {}
        for event in AuditLog.objects.filter(
            election=election,
            student_id__in=page_ids,
        ).order_by("-created_at", "-id"):
            latest_events.setdefault(event.student_id, event)

        rows = []
        for student in voter_records:
            access_valid = student_has_current_voter_access(student, now)
            latest_event = latest_events.get(student.id)
            if student.has_voted:
                state, reason = "voted", "This voter has already submitted a ballot."
            elif lifecycle_status != "open":
                state = lifecycle_status
                reason = {
                    "scheduled": "Voting has not started yet.",
                    "paused": "Voting is paused.",
                    "ended": "Voting has ended.",
                }.get(lifecycle_status, "Voting is unavailable.")
            elif not ballot_ready:
                state, reason = "ballot_unready", "The ballot is not ready for voting."
            elif not access_valid and latest_event and (
                latest_event.action == "VOTER_ACCESS_EXPIRED"
                or (
                    latest_event.action == "VOTER_AUTH_FAILED"
                    and latest_event.metadata.get("reason") == "session_expired"
                )
            ):
                reason_code = latest_event.metadata.get("reason")
                state = reason_code or "inactive"
                reason = {
                    "session_expired": "The authenticated voting session expired.",
                    "activation_expired": "The voter activation expired.",
                    "pin_expired": "The voter PIN has expired.",
                    "pin_missing": "No valid voter PIN is available.",
                    "pin_attempts_exhausted": "Access was disabled after too many incorrect PIN attempts.",
                }.get(reason_code, "Voter access expired.")
            elif election.voter_login_mode == Election.VOTER_LOGIN_MODE_SMS:
                attempt = latest_attempts.get(student.id)
                valid_pin = _student_has_valid_sms_pin(student, election, now)
                if valid_pin and attempt and attempt.status == VoterSMSAttempt.Status.GENERATED:
                    state, reason = "generated", "A PIN is active but was not sent by SMS."
                elif valid_pin:
                    state, reason = "pin_active", "A valid PIN is available for login."
                elif student.voting_pin_created_at:
                    state, reason = "pin_expired", "The voter PIN has expired."
                elif not student.phone_number:
                    state, reason = "missing_phone", "No phone number is registered for SMS delivery."
                elif attempt and attempt.status in {VoterSMSAttempt.Status.FAILED, VoterSMSAttempt.Status.DISABLED}:
                    state, reason = "sms_failed", "The last SMS attempt did not deliver a PIN."
                else:
                    state, reason = "not_sent", "No PIN has been sent or generated for this voter."
            elif student.voter_session_expires_at and voter_session_expired(student.voter_session_expires_at, now):
                state, reason = "session_expired", "The authenticated voting session has expired."
            elif student.voter_activation_expires_at and student.voter_activation_expires_at <= now:
                state, reason = "activation_expired", "The voter activation has expired."
            elif student.voting_pin_created_at and voter_access_expired(
                student.voting_pin_created_at, now, voter_pin_ttl_for_election(election)
            ):
                state, reason = "pin_expired", "The voter PIN has expired."
            elif access_valid:
                state, reason = "active", "The voter can currently log in."
            else:
                state, reason = "inactive", "This voter has not been activated."

            attempt = latest_attempts.get(student.id) if election.voter_login_mode == Election.VOTER_LOGIN_MODE_SMS else None
            rows.append({
                "id": student.id,
                "student_id": student.student_id,
                "full_name": student.full_name,
                "phone_number": student.phone_number,
                "has_voted": student.has_voted,
                "is_active": access_valid,
                "state": state,
                "reason": reason,
                "can_invalidate": access_valid and not student.has_voted,
                "last_attempt_at": attempt.attempted_at.isoformat() if attempt else None,
                "last_error_category": attempt.error_category if attempt else "",
            })

        response = paginator.get_paginated_response(rows)
        response.data["election_id"] = election.id
        return response

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

        record_audit_event(
            action="SMS_PIN_BATCH_DELIVERY",
            outcome=(
                AuditLog.Outcome.FAILURE
                if summary["failed"] and not summary["sent"]
                else AuditLog.Outcome.SUCCESS
            ),
            request=request,
            election=election,
            actor=request.user,
            metadata=summary,
        )

        return Response(
            {
                "detail": "Voter PIN delivery completed.",
                **summary,
            },
            status=status.HTTP_200_OK,
        )


class VoterSMSStatusView(APIView):
    """Return one database-paginated page of per-voter SMS/PIN status."""

    permission_classes = [IsStaffOrSuperUser]

    def get(self, request):
        election_id = request.query_params.get("election_id")
        if not election_id:
            return Response({"detail": "election_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            election = get_scoped_election_or_404(request.user, election_id)
        except (Election.DoesNotExist, Http404):
            return Response({"detail": "Election not found."}, status=status.HTTP_404_NOT_FOUND)
        if election.voter_login_mode != Election.VOTER_LOGIN_MODE_SMS:
            return Response(
                {"detail": "SMS status is only available for SMS PIN elections."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        voters = Student.objects.filter(election=election).order_by("id")
        search = request.query_params.get("search", "").strip()
        if search:
            from django.db.models import Q
            voters = voters.filter(
                Q(student_id__icontains=search)
                | Q(full_name__icontains=search)
                | Q(phone_number__icontains=search)
            )
        paginator = PageNumberPagination()
        paginator.page_size = 10
        page_students = list(paginator.paginate_queryset(voters, request, view=self))
        page_ids = [student.id for student in page_students]
        latest_attempts = {}
        for attempt in VoterSMSAttempt.objects.filter(
            election=election, student_id__in=page_ids
        ).order_by("-attempted_at", "-id"):
            latest_attempts.setdefault(attempt.student_id, attempt)

        now = timezone.now()
        delivery_window_open = (
            election_status(election) == "open" and election_ballot_ready(election)
        )
        rows = []
        for student in page_students:
            latest_attempt = latest_attempts.get(student.id)
            has_valid_pin = _student_has_valid_sms_pin(student, election, now)
            pin_expires_at = (
                student.voting_pin_created_at + voter_pin_ttl_for_election(election)
                if student.voting_pin_created_at else None
            )
            if student.has_voted:
                voter_status = "voted"
            elif has_valid_pin and latest_attempt and latest_attempt.status == VoterSMSAttempt.Status.GENERATED:
                voter_status = "generated"
            elif has_valid_pin:
                voter_status = "sent"
            elif not student.phone_number:
                voter_status = "missing_phone"
            elif latest_attempt and latest_attempt.status in {
                VoterSMSAttempt.Status.FAILED, VoterSMSAttempt.Status.DISABLED,
            }:
                voter_status = "failed"
            elif student.voting_pin_created_at:
                voter_status = "expired"
            else:
                voter_status = "not_sent"

            rows.append({
                "id": student.id,
                "student_id": student.student_id,
                "full_name": student.full_name,
                "phone_number": student.phone_number,
                "has_voted": student.has_voted,
                "status": voter_status,
                "can_resend": bool(
                    delivery_window_open and not student.has_voted
                    and bool(student.phone_number) and not has_valid_pin
                ),
                "last_attempt_status": latest_attempt.status if latest_attempt else None,
                "last_error_category": latest_attempt.error_category if latest_attempt else "",
                "last_attempt_at": (
                    timezone.localtime(latest_attempt.attempted_at).isoformat()
                    if latest_attempt else None
                ),
                "pin_created_at": (
                    timezone.localtime(student.voting_pin_created_at).isoformat()
                    if student.voting_pin_created_at else None
                ),
                "pin_expires_at": (
                    timezone.localtime(pin_expires_at).isoformat()
                    if pin_expires_at else None
                ),
            })

        response = paginator.get_paginated_response(rows)
        response.data["election_id"] = election.id
        return response

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
        record_audit_event(
            action="VOTER_PIN_GENERATED",
            outcome=(
                AuditLog.Outcome.SUCCESS
                if outcome == "generated"
                else AuditLog.Outcome.DENIED
            ),
            request=request,
            election=election,
            student=student,
            actor=request.user,
            metadata={"result": outcome, "delivery": "not_sent"},
        )
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
        record_audit_event(
            action="VOTER_PIN_RESENT",
            outcome=(
                AuditLog.Outcome.SUCCESS
                if outcome == "sent"
                else AuditLog.Outcome.FAILURE
            ),
            request=request,
            election=election,
            student=student,
            actor=request.user,
            metadata={"result": outcome},
        )
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
