from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser
from django.db import transaction
from rest_framework.exceptions import ParseError
from django.utils import timezone
from io import BytesIO
from openpyxl import load_workbook

from .models import Election, Position, Candidate, Vote, Student
from .serializers import (
    StudentSerializer,
    BulkStudentUploadSerializer,
    ElectionSerializer,
    PositionSerializer,
    CandidateSerializer,
    MultiVoteSerializer,
)
from .permissions import IsStaffOrSuperUser, IsActivatorOrSuperUser
from .authentication import VoterAuthentication


class ElectionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Public, read-only list of active elections.
    Write operations are handled via separate staff-protected endpoints.
    """
    queryset = Election.objects.filter(is_active=True)
    serializer_class = ElectionSerializer
    permission_classes = [AllowAny]


class StudentViewSet(viewsets.ModelViewSet):
    """
    Staff or superuser can manage students (CRUD).
    Activator is intentionally excluded from create/update/delete and instead
    uses StudentActivationView to only toggle activation.
    """
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    permission_classes = [IsStaffOrSuperUser]


class BulkStudentUploadView(APIView):
    """
    Allow staff/superuser to upload an Excel file to create students in bulk.
    Expected columns (case-insensitive): student_id, full_name, class_name.
    """

    permission_classes = [IsStaffOrSuperUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = BulkStudentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data["file"]

        try:
            wb = load_workbook(filename=BytesIO(upload.read()), read_only=True)
            ws = wb.active
        except Exception:
            return Response(
                {"detail": "Could not read Excel file."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Map headers to indices
        header_row = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), [])
        header_map = {str(h or "").strip().lower(): idx for idx, h in enumerate(header_row)}
        required = ["student_id", "full_name", "class_name"]
        missing = [h for h in required if h not in header_map]
        if missing:
            return Response(
                {"detail": f"Missing columns: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows_to_create = []
        file_ids = set()
        for row in ws.iter_rows(min_row=2, values_only=True):
            student_id = (row[header_map["student_id"]] or "").strip()
            full_name = (row[header_map["full_name"]] or "").strip()
            class_name = (row[header_map["class_name"]] or "").strip()

            if not student_id or not full_name or not class_name:
                continue  # skip incomplete rows

            if student_id in file_ids:
                # skip duplicates inside the same file
                continue
            file_ids.add(student_id)

            rows_to_create.append(
                Student(
                    student_id=student_id,
                    full_name=full_name,
                    class_name=class_name,
                )
            )

        if not rows_to_create:
            return Response(
                {"detail": "No valid rows found to import."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_ids = set(
            Student.objects.filter(student_id__in=[s.student_id for s in rows_to_create])
            .values_list("student_id", flat=True)
        )

        rows_to_create = [s for s in rows_to_create if s.student_id not in existing_ids]

        if not rows_to_create:
            return Response(
                {"detail": "All provided students already exist."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        Student.objects.bulk_create(rows_to_create, ignore_conflicts=True)
        return Response(
            {
                "detail": "Students imported.",
                "created": len(rows_to_create),
                "skipped_existing": len(existing_ids),
            },
            status=status.HTTP_201_CREATED,
        )


class PositionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Public, read-only list of positions for a given election.
    Expects `?election_id=` as a query parameter.
    """
    serializer_class = PositionSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        election_id = self.request.query_params.get("election_id")
        if election_id:
            return Position.objects.filter(election_id=election_id)
        return Position.objects.none()


class CandidateViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Public, read-only list of candidates for a given position.
    Expects `?position_id=` as a query parameter.
    """
    serializer_class = CandidateSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        position_id = self.request.query_params.get("position_id")
        if position_id:
            return Candidate.objects.filter(position_id=position_id)
        return Candidate.objects.none()


class MultiVoteView(APIView):
    """
    Students authenticate via headers using `VoterAuthentication`.
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
                # Lock fresh student row to avoid races
                student = Student.objects.select_for_update().get(pk=student_user.pk)

                now = timezone.now()

                if not getattr(student, "is_active", False):
                    return Response(
                        {"detail": "Student is not activated to vote."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                if getattr(student, "has_voted", False):
                    return Response(
                        {"detail": "Student has already voted."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                votes_to_create = []
                election_cache = {}
                position_cache = {}
                candidate_cache = {}
                for vote_data in data["votes"]:
                    election_id = vote_data["election"]
                    position_id = vote_data["position"]
                    candidate_id = vote_data["candidate"]

                    # Load and validate election (must be active and within window)
                    election = election_cache.get(election_id)
                    if election is None:
                        election = (
                            Election.objects.filter(pk=election_id, is_active=True)
                            .select_for_update()
                            .first()
                        )
                        election_cache[election_id] = election
                    if election is None:
                        return Response(
                            {"detail": "Election is not active or does not exist."},
                            status=status.HTTP_403_FORBIDDEN,
                        )
                    if election.start_time > now or election.end_time < now:
                        return Response(
                            {"detail": "Election is not within the voting window."},
                            status=status.HTTP_403_FORBIDDEN,
                        )

                    # Validate position belongs to election
                    position = position_cache.get(position_id)
                    if position is None:
                        position = (
                            Position.objects.filter(
                                pk=position_id, election_id=election.pk
                            )
                            .select_for_update()
                            .first()
                        )
                        position_cache[position_id] = position
                    if position is None:
                        return Response(
                            {"detail": "Position does not belong to election."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    # Validate candidate belongs to position
                    candidate = candidate_cache.get(candidate_id)
                    if candidate is None:
                        candidate = (
                            Candidate.objects.filter(
                                pk=candidate_id, position_id=position.pk
                            )
                            .select_for_update()
                            .first()
                        )
                        candidate_cache[candidate_id] = candidate
                    if candidate is None:
                        return Response(
                            {"detail": "Candidate does not belong to position."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    # Ensure no existing vote for that position by this voter token
                    if Vote.objects.filter(
                        voter_hash=token, position_id=position_id
                    ).exists():
                        return Response(
                            {"detail": "Duplicate vote detected for a position."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    votes_to_create.append(
                        Vote(
                            voter_hash=token,
                            election_id=election_id,
                            position_id=position_id,
                            candidate_id=candidate_id,
                        )
                    )

                Vote.objects.bulk_create(votes_to_create)

                # Mark student as voted and deactivate
                student.has_voted = True
                student.is_active = False
                student.save(update_fields=["has_voted", "is_active"])

        except Student.DoesNotExist:
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            return Response(
                {"detail": "Error saving votes."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"detail": "All votes submitted successfully."},
            status=status.HTTP_201_CREATED,
        )


class StudentActivationView(APIView):
    """
    Toggle `is_active` on a Student. Only activator or superuser may call.
    Accepts JSON: { "student_id": "S12345", "is_active": true }
    """
    permission_classes = [IsActivatorOrSuperUser]

    def post(self, request):
        student_id = request.data.get("student_id")
        if not student_id:
            return Response(
                {"detail": "student_id required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_active = request.data.get("is_active")
        if is_active is None:
            return Response(
                {"detail": "is_active required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            student = Student.objects.get(student_id=student_id)
        except Student.DoesNotExist:
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Only toggle the is_active flag; do not expose other fields
        student.is_active = bool(is_active)
        student.save(update_fields=["is_active"])
        return Response(
            {"detail": "Student activation updated."},
            status=status.HTTP_200_OK,
        )