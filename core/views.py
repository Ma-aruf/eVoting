from io import BytesIO

from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework import viewsets, status
from rest_framework.exceptions import ParseError
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import VoterAuthentication
from .models import Election, Position, Candidate, Vote, Student
from .permissions import IsStaffOrSuperUser, IsActivatorOrSuperUser, IsStaffOrSuperUserOrReadOnlyActivator, IsSuperUser
from .serializers import (
    StudentSerializer,
    BulkStudentUploadSerializer,
    ElectionSerializer,
    PositionSerializer,
    CandidateSerializer,
    MultiVoteSerializer,
    UserSerializer,
)
from .utils import generate_voter_hmac

User = get_user_model()


class UserViewSet(viewsets.ModelViewSet):
    """
    Superuser-only: manage admin users (staff, activator, superuser).
    """
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserSerializer
    permission_classes = [IsSuperUser]

    def get_queryset(self):
        return User.objects.all().order_by('-date_joined')


class ElectionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Election.objects.all()  #
    serializer_class = ElectionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Optional: allow filtering by is_active
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            return Election.objects.filter(is_active=is_active.lower() == 'true')
        return Election.objects.all()


class StudentViewSet(viewsets.ModelViewSet):
    """
    Staff or superuser can manage students (CRUD).
    Activator is intentionally excluded from create/update/delete and instead
    uses StudentActivationView to only toggle activation.
    """
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    permission_classes = [IsStaffOrSuperUserOrReadOnlyActivator]

    def destroy(self, request, *args, **kwargs):
        student = self.get_object()
        if student.has_voted:
            return Response(
                {"detail": "Cannot delete a student who has already voted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


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
            # Force everything to string right away (handles int/float/None nicely)
            get_str = lambda idx: str(row[idx]).strip() if row[idx] is not None else ""

            student_id = get_str(header_map["student_id"])
            full_name = get_str(header_map["full_name"])
            class_name = get_str(header_map["class_name"])

            if not student_id or not full_name or not class_name:
                continue  # skip incomplete rows

            if student_id in file_ids:
                continue  # skip duplicates in the same file
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


class PositionViewSet(viewsets.ModelViewSet):
    """
    Read positions publicly, but only staff/superuser can update/delete.
    Expects `?election_id=` as a query parameter for listing.
    """
    serializer_class = PositionSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsStaffOrSuperUser()]

    def get_queryset(self):
        election_id = self.request.query_params.get("election_id")
        if election_id:
            return Position.objects.filter(election_id=election_id)
        return Position.objects.all()


class PositionCreateView(APIView):
    """
    Staff or superuser can create positions for an election.
    """
    permission_classes = [IsStaffOrSuperUser]

    def post(self, request):
        serializer = PositionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        position = serializer.save()
        return Response(PositionSerializer(position).data, status=status.HTTP_201_CREATED)

    def put(self, request, pk):
        position = get_object_or_404(Position, pk=pk)
        serializer = PositionSerializer(
            position,
            data=request.data,
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        position = serializer.save()
        return Response(
            PositionSerializer(position).data,
            status=status.HTTP_200_OK
        )

    def patch(self, request, pk):
        return self.put(request, pk)

    def delete(self, request, pk):
        position = get_object_or_404(Position, pk=pk)
        position.delete()
        return Response(
            {"detail": "Position deleted successfully"},
            status=status.HTTP_204_NO_CONTENT
        )


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


class CandidateCreateView(APIView):
    """
    Staff or superuser can register candidates for positions.
    """
    permission_classes = [IsStaffOrSuperUser]

    # CREATE
    def post(self, request):
        serializer = CandidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        candidate = serializer.save()
        return Response(CandidateSerializer(candidate).data, status=status.HTTP_201_CREATED)

    # EDIT
    def put(self, request, pk):
        candidate = get_object_or_404(Candidate, pk=pk)
        serializer = CandidateSerializer(
            candidate,
            data=request.data,
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        candidate = serializer.save()
        return Response(
            CandidateSerializer(candidate).data,
            status=status.HTTP_200_OK
        )

    def patch(self, request, pk):
        return self.put(request, pk)

    # DELETE
    def delete(self, request, pk):
        candidate = get_object_or_404(Candidate, pk=pk)
        candidate.delete()
        return Response(
            {"detail": "Candidate deleted successfully"},
            status=status.HTTP_204_NO_CONTENT
        )


class ElectionManageView(APIView):
    """
    Staff or superuser can start/stop elections by toggling `is_active`.
    """

    print("Inside ElectionManageView")
    permission_classes = [IsStaffOrSuperUser]

    def get(self, request):
        # Return all elections (active and inactive)
        elections = Election.objects.all().order_by('-year', '-start_time')
        serializer = ElectionSerializer(elections, many=True)
        return Response(serializer.data)

    def patch(self, request):
        """
        Accepts JSON: { "election_id": 1, "is_active": true }
        When setting an election active, all other elections are deactivated.
        """
        print("Inside post")
        election_id = request.data.get("election_id")
        is_active = request.data.get("is_active")

        if election_id is None:
            return Response(
                {"detail": "election_id required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if is_active is None:
            return Response(
                {"detail": "is_active required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            election = Election.objects.get(pk=election_id)
        except Election.DoesNotExist:
            return Response(
                {"detail": "Election not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            if bool(is_active):
                # Deactivate all others, then activate this one
                Election.objects.exclude(pk=election.pk).update(is_active=False)
                election.is_active = True
            else:
                election.is_active = False
            election.save(update_fields=["is_active"])

        return Response(
            {"detail": "Election status updated.", "id": election.pk, "is_active": election.is_active},
            status=status.HTTP_200_OK,
        )


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
                student = Student.objects.select_for_update().get(
                    pk=student_user.pk
                )

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
        except Exception as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"detail": "All votes submitted successfully."},
            status=status.HTTP_201_CREATED,
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            "username": user.username,
            "role": user.role,
        })


class StudentActivationView(APIView):
    """
    Toggle `is_active` on a Student. Only activator or superuser may call.
    Accepts JSON: { "student_id": "S12345", "is_active": true }
    """
    permission_classes = [IsActivatorOrSuperUser]

    def post(self, request):
        print("INSIDE ACTIVATION VIEW - POST CALLED")  # ← add this
        print(request.path, request.method)
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

        # Check current status for better message
        current_status = student.is_active
        new_status = bool(is_active)

        if current_status == new_status:
            status_text = "active" if current_status else "inactive"
            return Response(
                {"detail": f"Student is already {status_text}."},
                status=status.HTTP_200_OK,
            )

        # Only toggle the is_active flag
        student.is_active = new_status
        student.save(update_fields=["is_active"])

        status_text = "activated" if new_status else "deactivated"
        return Response(
            {"detail": f"Student {status_text} successfully."},
            status=status.HTTP_200_OK,
        )


class ElectionCreateView(APIView):
    """
    Staff or superuser can create a new election.
    """
    permission_classes = [IsStaffOrSuperUser]

    def post(self, request):
        serializer = ElectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        election = serializer.save()
        return Response(ElectionSerializer(election).data, status=status.HTTP_201_CREATED)


class StudentVoterLoginView(APIView):
    """
    Generate HMAC token for active students who haven't voted yet.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        student_id = request.data.get("student_id")

        if not student_id:
            return Response(
                {"detail": "student_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if there's an active election
        active_election = Election.objects.filter(is_active=True).first()
        if not active_election:
            return Response(
                {"detail": "No active election at this time."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check if election is within voting window
        now = timezone.now()
        if now < active_election.start_time:
            return Response(
                {"detail": "Voting has not started yet."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if now > active_election.end_time:
            return Response(
                {"detail": "Voting has ended."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            student = Student.objects.get(student_id=student_id)
            print("Student found:", student)
        except Student.DoesNotExist:
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check if student has already voted (check this first since voting also deactivates the student)
        if student.has_voted:
            return Response(
                {"detail": "Student has already voted."},
                status=status.HTTP_409_CONFLICT,
            )

        # Check if student is active
        if not student.is_active:
            print("is student activated?: ", student.is_active)
            return Response(
                {"detail": "Student is not activated to vote."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Generate HMAC token
        token = generate_voter_hmac(student.student_id)

        return Response({
            "token": token,
            "student": {
                "id": student.id,
                "student_id": student.student_id,
                "full_name": student.full_name,
                "class_name": student.class_name,
            },
            "election": {
                "id": active_election.id,
                "name": active_election.name,
                "year": active_election.year,
            }
        }, status=status.HTTP_200_OK)


class ElectionStatsView(APIView):
    """Get basic election statistics"""
    permission_classes = [IsStaffOrSuperUser]

    def get(self, request, election_id):
        try:
            election = Election.objects.get(pk=election_id)
        except Election.DoesNotExist:
            return Response(
                {"detail": "Election not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        total_voters = Student.objects.count()
        voters_voted = Student.objects.filter(has_voted=True).count()

        return Response({
            "election_id": election.id,
            "election_name": election.name,
            "total_voters": total_voters,
            "voters_voted": voters_voted,
            "turnout_percentage": round((voters_voted / total_voters * 100), 2) if total_voters > 0 else 0.0
        })


class PositionStatsView(APIView):
    """Get statistics for a specific position including skipped votes"""
    permission_classes = [IsStaffOrSuperUser]

    def get(self, request):
        position_id = request.query_params.get("position_id")
        if not position_id:
            return Response(
                {"detail": "position_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            position = Position.objects.get(pk=position_id)
        except Position.DoesNotExist:
            return Response(
                {"detail": "Position not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        election = position.election

        # Unique voters who cast any vote in this election
        unique_voters = Vote.objects.filter(election=election).values('voter_hash').distinct().count()

        # Votes actually cast for this position
        position_votes = Vote.objects.filter(position=position).count()

        skipped = max(0, unique_voters - position_votes)

        return Response({
            "position_id": position.id,
            "position_name": position.name,
            "election": election.name,
            "unique_voters_in_election": unique_voters,
            "votes_for_this_position": position_votes,
            "skipped_votes": skipped,
            "skip_percentage": round((skipped / unique_voters * 100), 2) if unique_voters > 0 else 0.0
        })


class ElectionResultsView(APIView):
    """Get comprehensive results for an entire election"""
    permission_classes = [IsStaffOrSuperUser]

    def get(self, request, election_id):
        try:
            election = Election.objects.get(pk=election_id)
        except Election.DoesNotExist:
            return Response(
                {"detail": "Election not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # All positions in display order
        positions = Position.objects.filter(election=election).order_by('display_order')

        # Total unique voters in this election (across all positions)
        unique_voters = Vote.objects.filter(election=election).values('voter_hash').distinct().count()

        results = []

        for position in positions:
            candidates = Candidate.objects.filter(position=position)

            candidate_results = []
            total_valid_votes_this_position = 0

            for candidate in candidates:
                vote_count = Vote.objects.filter(
                    candidate=candidate,
                    position=position
                ).count()

                candidate_results.append({
                    "id": candidate.id,
                    "student_id": candidate.student.student_id,
                    "candidate_name": candidate.student.full_name,
                    "photo_url": candidate.photo_url or "",
                    "vote_count": vote_count,
                })

                total_valid_votes_this_position += vote_count

            skipped = max(0, unique_voters - total_valid_votes_this_position)

            # Add percentages
            for cand in candidate_results:
                cand["percentage"] = (
                    round((cand["vote_count"] / total_valid_votes_this_position * 100), 2)
                    if total_valid_votes_this_position > 0 else 0.0
                )

            # Sort candidates by votes descending
            candidate_results.sort(key=lambda x: x["vote_count"], reverse=True)

            results.append({
                "position_id": position.id,
                "position_name": position.name,
                "display_order": position.display_order,
                "total_valid_votes": total_valid_votes_this_position,
                "skipped_votes": skipped,
                "skip_percentage": round((skipped / unique_voters * 100), 2) if unique_voters > 0 else 0.0,
                "candidates": candidate_results,
            })

        # Overall election stats
        total_students = Student.objects.count()
        students_who_voted = Student.objects.filter(has_voted=True).count()

        return Response({
            "election_id": election.id,
            "election_name": election.name,
            "year": election.year,
            "total_students": total_students,
            "students_who_voted": students_who_voted,
            "voter_turnout_percentage": round((students_who_voted / total_students * 100),
                                              2) if total_students > 0 else 0.0,
            "unique_voters_who_cast_at_least_one_vote": unique_voters,
            "positions": results,
        })


class CandidatesForPositionView(APIView):
    permission_classes = [IsStaffOrSuperUser]

    def get(self, request):
        position_id = request.query_params.get("position_id")
        print(position_id)

        if not position_id:
            return Response(
                {"detail": "position_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            candidates = Candidate.objects.filter(position_id=position_id).select_related('student')
        except ValueError:
            return Response(
                {"detail": "Invalid position_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = []

        for candidate in candidates:
            vote_count = Vote.objects.filter(
                candidate_id=candidate.id,
                position_id=position_id
            ).count()

            candidate_data = {
                "candidate_id": candidate.id,
                "candidate_name": candidate.student.full_name,
                "student_id": candidate.student.student_id,
                "positionid": int(position_id),  # Add position_id to response
                "vote_count": vote_count
            }

            result.append(candidate_data)

        return Response(result, status=status.HTTP_200_OK)
