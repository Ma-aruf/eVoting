# python
import logging
import time
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.utils.translation import gettext as _
from django.utils import timezone
from django.db import transaction
from .models import Student, Election
from .audit import record_audit_event
from .models import AuditLog
from .utils import (
    deactivate_expired_voter_session,
    verify_voter_token,
)
from .election_lifecycle import election_lifecycle


class StudentUser:
    """
    Minimal user-like object for authenticated student voters.
    DRF `IsAuthenticated` checks `is_authenticated` attribute.
    """
    def __init__(self, student: Student):
        self.student = student

    @property
    def is_authenticated(self):
        return True

    def __str__(self):
        return f"StudentUser({self.student.student_id})"


class VoterAuthentication(BaseAuthentication):
    """
    Authenticate student voters via headers:
    - X-Student-Id: student_id
    - X-Election-Id: election_id (to scope student lookup)
    - X-Voter-Token: HMAC token (hex)
    On success returns (StudentUser(student), token)
    """
    security_logger = logging.getLogger('security')
    
    def authenticate(self, request):
        student_id = request.META.get("HTTP_X_STUDENT_ID")
        election_id = request.META.get("HTTP_X_ELECTION_ID")
        token = request.META.get("HTTP_X_VOTER_TOKEN")
        client_ip = request.META.get("REMOTE_ADDR")
        
        if not student_id or not token or not election_id:
            return None  # allow other authenticators to run or cause IsAuthenticated to fail

        # Validate and get the specific election. Availability comes from the
        # single lifecycle service, not from the manual enable flag alone.
        try:
            election = Election.objects.get(pk=election_id)
        except Election.DoesNotExist:
            self.security_logger.warning(
                f"AUTH_FAILED_ELECTION: student_id={student_id}, election_id={election_id}, ip={client_ip}"
            )
            record_audit_event(
                action="VOTER_AUTH_FAILED",
                outcome=AuditLog.Outcome.DENIED,
                request=request,
                student_id=student_id,
                metadata={"reason": "election_not_found", "election_id": election_id},
            )
            raise AuthenticationFailed(_("Election not found."))

        now = timezone.now()
        lifecycle = election_lifecycle(
            election, now, include_candidate_lock=False
        )
        if lifecycle["status"] == "scheduled":
            self.security_logger.warning(
                f"AUTH_FAILED_EARLY: student_id={student_id}, election_id={election_id}, ip={client_ip}"
            )
            record_audit_event(
                action="VOTER_AUTH_FAILED",
                outcome=AuditLog.Outcome.DENIED,
                request=request,
                election=election,
                student_id=student_id,
                metadata={"reason": "election_not_started"},
            )
            raise AuthenticationFailed(_("Voting has not started yet."))
        if lifecycle["status"] == "ended":
            self.security_logger.warning(
                f"AUTH_FAILED_LATE: student_id={student_id}, election_id={election_id}, ip={client_ip}"
            )
            record_audit_event(
                action="VOTER_AUTH_FAILED",
                outcome=AuditLog.Outcome.DENIED,
                request=request,
                election=election,
                student_id=student_id,
                metadata={"reason": "election_ended"},
            )
            raise AuthenticationFailed(_("Voting has ended."))
        if not lifecycle["voting_open"]:
            self.security_logger.warning(
                f"AUTH_FAILED_PAUSED: student_id={student_id}, election_id={election_id}, ip={client_ip}"
            )
            record_audit_event(
                action="VOTER_AUTH_FAILED",
                outcome=AuditLog.Outcome.DENIED,
                request=request,
                election=election,
                student_id=student_id,
                metadata={"reason": "election_paused"},
            )
            raise AuthenticationFailed(_("Voting is paused for this election."))

        # Use composite lookup: student_id + election_id
        try:
            with transaction.atomic():
                student = Student.objects.select_for_update().get(
                    student_id=student_id, election=election
                )
                expiry = student.voter_session_expires_at
                session_reason = (
                    "missing_session" if expiry is None
                    else "session_expired" if now >= expiry
                    else None
                )
                if session_reason == "session_expired" and not student.has_voted:
                    deactivate_expired_voter_session(student)
        except Student.DoesNotExist:
            self.security_logger.warning(
                f"AUTH_FAILED_STUDENT: student_id={student_id}, election_id={election_id}, ip={client_ip}"
            )
            record_audit_event(
                action="VOTER_AUTH_FAILED",
                outcome=AuditLog.Outcome.DENIED,
                request=request,
                election=election,
                student_id=student_id,
                metadata={"reason": "student_not_found"},
            )
            raise AuthenticationFailed(_("Invalid student identifier for this election."))

        if not student.has_voted and session_reason:
            remaining_seconds = (
                (expiry - now).total_seconds() if expiry is not None else None
            )
            request_id = getattr(request, "correlation_id", "unknown")
            started_at = getattr(request, "started_at", None)
            elapsed_ms = round((time.monotonic() - started_at) * 1000) if started_at else None
            self.security_logger.warning(
                "VOTER_SESSION_REJECTED request_id=%s reason=%s election_id=%s "
                "session_remaining_seconds=%s request_elapsed_ms=%s",
                request_id, session_reason, election_id, remaining_seconds, elapsed_ms,
            )
            record_audit_event(
                action="VOTER_AUTH_FAILED",
                outcome=AuditLog.Outcome.DENIED,
                request=request,
                election=election,
                student=student,
                student_id=student_id,
                metadata={
                    "reason": session_reason,
                    "session_remaining_seconds": remaining_seconds,
                    "request_id": request_id,
                },
            )
            detail = (
                _("Your voting session has expired. Please ask an election official to reactivate you.")
                if session_reason == "session_expired"
                else _("No active voting session is recorded. Please sign in again.")
            )
            raise AuthenticationFailed(
                detail
            )
        # Verify token using election-scoped key (student_id_electionId)
        if not verify_voter_token(f"{student.student_id}_{election.id}", token):
            self.security_logger.warning(
                f"AUTH_FAILED_TOKEN: student_id={student_id}, election_id={election_id}, ip={client_ip}"
            )
            record_audit_event(
                action="VOTER_AUTH_FAILED",
                outcome=AuditLog.Outcome.DENIED,
                request=request,
                election=election,
                student=student,
                student_id=student_id,
                metadata={"reason": "invalid_token"},
            )
            raise AuthenticationFailed(_("Invalid voter token."))

        return (StudentUser(student), token)
