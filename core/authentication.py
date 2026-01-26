# python
from types import SimpleNamespace
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.utils.translation import gettext as _
from .models import Student, Election
from .utils import verify_voter_hmac


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
    - X-Voter-Token: HMAC token (hex)
    On success returns (StudentUser(student), token)
    """
    def authenticate(self, request):
        student_id = request.META.get("HTTP_X_STUDENT_ID")
        token = request.META.get("HTTP_X_VOTER_TOKEN")
        if not student_id or not token:
            return None  # allow other authenticators to run or cause IsAuthenticated to fail

        # Get the active election to scope the student lookup
        try:
            active_election = Election.objects.filter(is_active=True).first()
            if not active_election:
                raise AuthenticationFailed(_("No active election found."))
            
            # Use composite lookup with active election
            student = Student.objects.get(student_id=student_id, election=active_election)
        except Student.DoesNotExist:
            raise AuthenticationFailed(_("Invalid student identifier for active election."))
        except Student.MultipleObjectsReturned:
            # This should not happen with composite constraint, but handle it
            raise AuthenticationFailed(_("Multiple students found with same identifier. Please contact administrator."))

        if not verify_voter_hmac(student.student_id, token):
            raise AuthenticationFailed(_("Invalid voter token."))

        return (StudentUser(student), token)