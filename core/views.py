# python
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from rest_framework.exceptions import ParseError

from .models import Election, Position, Candidate, Vote, Student
from .serializers import (
    ElectionSerializer,
    PositionSerializer,
    CandidateSerializer,
    MultiVoteSerializer,
)
from .permissions import IsStaffOrSuperUser, IsActivatorOrSuperUser
from .authentication import VoterAuthentication


class ElectionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Election.objects.filter(is_active=True)
    serializer_class = ElectionSerializer
    permission_classes = [IsStaffOrSuperUser]


class PositionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PositionSerializer
    permission_classes = [IsStaffOrSuperUser]

    def get_queryset(self):
        election_id = self.request.query_params.get("election_id")
        if election_id:
            return Position.objects.filter(election_id=election_id)
        return Position.objects.none()


class CandidateViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CandidateSerializer
    permission_classes = [IsStaffOrSuperUser]

    def get_queryset(self):
        position_id = self.request.query_params.get("position_id")
        if position_id:
            return Candidate.objects.filter(position_id=position_id)
        return Candidate.objects.none()


class MultiVoteView(APIView):
    """
    Students authenticate via headers using VoterAuthentication.
    View enforces activation, single-vote, and transactional locking.
    """
    authentication_classes = [VoterAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MultiVoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # `request.user` is StudentUser from VoterAuthentication
        student_user = getattr(request.user, "student", None)
        token = getattr(request, "auth", None)
        if student_user is None or token is None:
            raise ParseError("Student authentication required via headers.")

        try:
            with transaction.atomic():
                # lock fresh student row to avoid races
                student = Student.objects.select_for_update().get(pk=student_user.pk)

                if not getattr(student, "is_active", False):
                    return Response({"detail": "Student is not activated to vote."}, status=status.HTTP_403_FORBIDDEN)

                if getattr(student, "has_voted", False):
                    return Response({"detail": "Student has already voted."}, status=status.HTTP_403_FORBIDDEN)

                votes_to_create = []
                for vote_data in data["votes"]:
                    election_id = vote_data["election"]
                    position_id = vote_data["position"]
                    candidate_id = vote_data["candidate"]

                    # ensure no existing vote for that election/position by this voter token
                    if Vote.objects.filter(voter_hash=token, position_id=position_id).exists():
                        return Response({"detail": "Duplicate vote detected for a position."}, status=status.HTTP_400_BAD_REQUEST)

                    votes_to_create.append(
                        Vote(
                            voter_hash=token,
                            election_id=election_id,
                            position_id=position_id,
                            candidate_id=candidate_id,
                        )
                    )

                Vote.objects.bulk_create(votes_to_create)

                # mark student as voted and deactivate
                student.has_voted = True
                student.is_active = False
                student.save(update_fields=["has_voted", "is_active"])

        except Student.DoesNotExist:
            return Response({"detail": "Student not found."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"detail": "Error saving votes."}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"detail": "All votes submitted successfully."}, status=status.HTTP_201_CREATED)


class StudentActivationView(APIView):
    """
    Toggle `is_active` on a Student. Only activator or superuser may call.
    Accepts JSON: { "student_id": "S12345", "is_active": true }
    """
    permission_classes = [IsActivatorOrSuperUser]

    def post(self, request):
        student_id = request.data.get("student_id")
        if not student_id:
            return Response({"detail": "student_id required."}, status=status.HTTP_400_BAD_REQUEST)

        is_active = request.data.get("is_active")
        if is_active is None:
            return Response({"detail": "is_active required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            student = Student.objects.get(student_id=student_id)
        except Student.DoesNotExist:
            return Response({"detail": "Student not found."}, status=status.HTTP_404_NOT_FOUND)

        # Only toggle the is_active flag; do not expose other fields
        student.is_active = bool(is_active)
        student.save(update_fields=["is_active"])
        return Response({"detail": "Student activation updated."}, status=status.HTTP_200_OK)