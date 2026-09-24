# python
import logging
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.utils.translation import gettext as _
from django.utils import timezone
from .models import Student, Election
from .utils import verify_voter_token
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
        
        client_ip = request.META.get('REMOTE_ADDR')
        
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
            raise AuthenticationFailed(_("Election not found."))

        now = timezone.now()
        lifecycle = election_lifecycle(
            election, now, include_candidate_lock=False
        )
        if lifecycle["status"] == "scheduled":
            self.security_logger.warning(
                f"AUTH_FAILED_EARLY: student_id={student_id}, election_id={election_id}, ip={client_ip}"
            )
            raise AuthenticationFailed(_("Voting has not started yet."))
        if lifecycle["status"] == "ended":
            self.security_logger.warning(
                f"AUTH_FAILED_LATE: student_id={student_id}, election_id={election_id}, ip={client_ip}"
            )
            raise AuthenticationFailed(_("Voting has ended."))
        if not lifecycle["voting_open"]:
            self.security_logger.warning(
                f"AUTH_FAILED_PAUSED: student_id={student_id}, election_id={election_id}, ip={client_ip}"
            )
            raise AuthenticationFailed(_("Voting is paused for this election."))

        # Use composite lookup: student_id + election_id
        try:
            student = Student.objects.get(student_id=student_id, election=election)
        except Student.DoesNotExist:
            self.security_logger.warning(
                f"AUTH_FAILED_STUDENT: student_id={student_id}, election_id={election_id}, ip={client_ip}"
            )
            raise AuthenticationFailed(_("Invalid student identifier for this election."))

        # Verify token using election-scoped key (student_id_electionId)
        if not verify_voter_token(f"{student.student_id}_{election.id}", token):
            self.security_logger.warning(
                f"AUTH_FAILED_TOKEN: student_id={student_id}, election_id={election_id}, ip={client_ip}"
            )
            raise AuthenticationFailed(_("Invalid voter token."))

        return (StudentUser(student), token)
