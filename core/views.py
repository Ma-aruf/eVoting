from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import transaction

from .models import Election, Position, Candidate, Vote, Student
from .serializers import (
    ElectionSerializer,
    PositionSerializer,
    CandidateSerializer,
    MultiVoteSerializer,
)


class ElectionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Election.objects.filter(is_active=True)
    serializer_class = ElectionSerializer


class PositionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PositionSerializer

    def get_queryset(self):
        election_id = self.request.query_params.get("election_id")
        if election_id:
            return Position.objects.filter(election_id=election_id)
        return Position.objects.none()


class CandidateViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CandidateSerializer

    def get_queryset(self):
        position_id = self.request.query_params.get("position_id")
        if position_id:
            return Candidate.objects.filter(position_id=position_id)
        return Candidate.objects.none()


class MultiVoteView(APIView):
    """
    Endpoint for submitting all votes at once.
    """
    def post(self, request):
        serializer = MultiVoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        voter_hash = data["voter_hash"]

        student = Student.objects.get(student_id=voter_hash)

        try:
            with transaction.atomic():
                for vote_data in data["votes"]:
                    Vote.objects.create(
                        voter_hash=voter_hash,
                        election_id=vote_data["election"],
                        position_id=vote_data["position"],
                        candidate_id=vote_data["candidate"]
                    )

                # Update student after successful submission
                student.is_active = False
                student.has_voted = True
                student.save()

        except Exception:
            return Response({"detail": "Error saving votes."}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"detail": "All votes submitted successfully."}, status=status.HTTP_201_CREATED)
