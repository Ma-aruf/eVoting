# python
# file: core/utils.py
import hmac
import hashlib
from django.conf import settings

def make_voter_hmac(student_id: str) -> str:
    """
    Return hex HMAC-SHA256 of student_id using settings.VOTER_HMAC_KEY.
    """
    key = settings.VOTER_HMAC_KEY.encode()
    return hmac.new(key, student_id.encode(), hashlib.sha256).hexdigest()

def verify_voter_hmac(student_id: str, token: str) -> bool:
    """
    Constant-time compare expected HMAC with provided token.
    """
    expected = make_voter_hmac(student_id)
    return hmac.compare_digest(expected, token)


# python
# file: core/views.py (excerpt - updated MultiVoteView)
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import transaction

from .models import Vote, Student
from .serializers import MultiVoteSerializer
from .utils import verify_voter_hmac

class MultiVoteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        """
        Expect payload with:
        - student_id: real student identifier (used to locate Student row)
        - voter_hash: HMAC token (hex) computed by client or provisioned token
        - votes: list of votes
        """
        serializer = MultiVoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        student_id = data["student_id"]
        voter_hash = data["voter_hash"]

        try:
            with transaction.atomic():
                try:
                    student = Student.objects.select_for_update().get(student_id=student_id)
                except Student.DoesNotExist:
                    return Response({"detail": "Student not found."}, status=status.HTTP_400_BAD_REQUEST)

                # verify token matches HMAC(student_id)
                if not verify_voter_hmac(student.student_id, voter_hash):
                    return Response({"detail": "Invalid voter token."}, status=status.HTTP_403_FORBIDDEN)

                if not getattr(student, "is_active", False):
                    return Response({"detail": "Student is not activated to vote."}, status=status.HTTP_403_FORBIDDEN)

                if getattr(student, "has_voted", False):
                    return Response({"detail": "Student has already voted."}, status=status.HTTP_403_FORBIDDEN)

                votes_to_create = []
                for vote_data in data["votes"]:
                    if Vote.objects.filter(voter_hash=voter_hash, election_id=vote_data["election"]).exists():
                        return Response({"detail": "Duplicate vote detected for an election."}, status=status.HTTP_400_BAD_REQUEST)
                    votes_to_create.append(
                        Vote(
                            voter_hash=voter_hash,
                            election_id=vote_data["election"],
                            position_id=vote_data["position"],
                            candidate_id=vote_data["candidate"],
                        )
                    )

                Vote.objects.bulk_create(votes_to_create)

                student.has_voted = True
                student.is_active = False
                student.save()

        except Exception:
            return Response({"detail": "Error saving votes."}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"detail": "All votes submitted successfully."}, status=status.HTTP_201_CREATED)