from io import BytesIO
import logging
import sys
from contextlib import contextmanager

from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import ProtectedError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework import viewsets, status, serializers
from rest_framework.exceptions import ParseError
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .authentication import VoterAuthentication
from .models import Election, Position, Candidate, Vote, Student
from .permissions import (
    IsAdminUser,
    IsElectionDataViewer,
    IsStaffOrSuperUser,
    CanActivateVoters,
    IsStaffOrSuperUserOrReadOnlyActivator,
    IsSuperUser,
)
from .election_access import get_scoped_election_or_404, scope_queryset
from .serializers import (
    StudentSerializer,
    BulkStudentUploadSerializer,
    ElectionSerializer,
    PositionSerializer,
    CandidateSerializer,
    MultiVoteSerializer,
    ElectionToggleSerializer,
    ElectionEndTimeExtensionSerializer,
    ElectionScheduleUpdateSerializer,
    UserSerializer,
)
from .utils import (
    generate_voter_hmac,
    election_has_votes,
)
from .election_lifecycle import (
    election_ballot_ready,
    election_lifecycle,
    election_status,
    student_can_vote_now,
    ballot_change_lock_detail,
    position_voting_mode,
    VOTING_MODE_YES_NO,
)

User = get_user_model()


@contextmanager
def ballot_change_transaction(*election_ids):
    """Lock affected elections and enforce the shared ballot freeze rule."""
    ids = sorted({int(election_id) for election_id in election_ids if election_id})
    with transaction.atomic():
        elections = list(
            Election.objects.select_for_update()
            .filter(pk__in=ids)
            .order_by("pk")
        )
        now = timezone.now()
        for election in elections:
            detail = ballot_change_lock_detail(election, now)
            if detail:
                raise serializers.ValidationError({"detail": detail})
        yield {election.pk: election for election in elections}


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
    """
    Election data is available only to scoped management accounts.
    """
    queryset = Election.objects.all()
    serializer_class = ElectionSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        queryset = scope_queryset(Election.objects.all(), self.request.user, "id")
        voting_enabled = self.request.query_params.get("voting_enabled")
        legacy_is_active = self.request.query_params.get("is_active")
        boolean = serializers.BooleanField()
        if voting_enabled is not None and legacy_is_active is not None:
            if boolean.run_validation(voting_enabled) != boolean.run_validation(legacy_is_active):
                raise serializers.ValidationError({
                    "voting_enabled": "Conflicts with the deprecated is_active query parameter."
                })
        value = voting_enabled if voting_enabled is not None else legacy_is_active
        if value is not None:
            queryset = queryset.filter(voting_enabled=boolean.run_validation(value))
        return queryset


class StudentViewSet(viewsets.ModelViewSet):
    """
    Staff or superuser can manage students (CRUD).
    Activator is intentionally excluded from create/update/delete and instead
    uses StudentActivationView to only toggle activation.
    """
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    permission_classes = [IsStaffOrSuperUserOrReadOnlyActivator]

    def get_queryset(self):
        queryset = scope_queryset(Student.objects.all(), self.request.user)
        election_id = self.request.query_params.get("election_id")
        if election_id:
            return queryset.filter(election_id=election_id)
        return queryset

    def perform_create(self, serializer):
        """Ensure election is set when creating a student."""
        election_id = self.request.data.get('election_id')
        if not election_id:
            raise ParseError("election_id is required for student creation.")
        
        try:
            election = get_scoped_election_or_404(self.request.user, election_id)
        except Election.DoesNotExist:
            raise ParseError("Invalid election_id provided.")
        
        serializer.save(election=election)

    def destroy(self, request, *args, **kwargs):
        student = self.get_object()
        if student.has_voted:
            return Response(
                {"detail": "Cannot delete a student who has already voted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Student cannot be deleted because votes exist for a related candidate."},
                status=status.HTTP_400_BAD_REQUEST,
            )


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

        # Accept optional election_id from request; if not provided, reject
        election_id = request.data.get("election_id")
        if not election_id:
            return Response(
                {"detail": "election_id is required for bulk upload."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            election = get_scoped_election_or_404(request.user, election_id)
        except Election.DoesNotExist:
            return Response(
                {"detail": "Invalid election_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
                    election=election,
                )
            )

        if not rows_to_create:
            return Response(
                {"detail": "No valid rows found to import."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_ids = set(
            Student.objects.filter(
                student_id__in=[s.student_id for s in rows_to_create],
                election_id=election_id  # Only check within this election
            )
            .values_list("student_id", flat=True)
        )

        rows_to_create = [s for s in rows_to_create if s.student_id not in existing_ids]

        if not rows_to_create:
            return Response(
                {"detail": "All provided students already exist."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            Student.objects.bulk_create(rows_to_create, ignore_conflicts=True)
            return Response(
                {
                    "detail": "Students imported successfully.",
                    "created": len(rows_to_create),
                    "skipped_existing": len(existing_ids),
                    "election": election.name,
                },
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            return Response(
                {"detail": f"Bulk import failed: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


class PositionViewSet(viewsets.ModelViewSet):
    """
    Read positions through an authenticated admin or voter election context;
    only staff/superuser can update/delete.
    Expects `?election_id=` as a query parameter for listing.
    """
    serializer_class = PositionSerializer
    authentication_classes = [JWTAuthentication, VoterAuthentication]

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsElectionDataViewer()]
        return [IsStaffOrSuperUser()]

    def get_queryset(self):
        queryset = scope_queryset(Position.objects.all(), self.request.user)
        election_id = self.request.query_params.get("election_id")
        if election_id:
            return queryset.filter(election_id=election_id)
        return queryset

    def perform_create(self, serializer):
        election = serializer.validated_data["election"]
        get_scoped_election_or_404(self.request.user, election.pk)
        with ballot_change_transaction(election.pk):
            serializer.save()

    def perform_update(self, serializer):
        position = serializer.instance
        target = serializer.validated_data.get("election", position.election)
        get_scoped_election_or_404(self.request.user, target.pk)
        with ballot_change_transaction(position.election_id, target.pk):
            serializer.save()

    def perform_destroy(self, instance):
        with ballot_change_transaction(instance.election_id):
            instance.delete()


class PositionCreateView(APIView):
    """
    Staff or superuser can create positions for an election.
    """
    permission_classes = [IsStaffOrSuperUser]
    authentication_classes = [JWTAuthentication, VoterAuthentication]

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsElectionDataViewer()]
        return [IsStaffOrSuperUser()]

    def get(self, request, pk):
        position = get_object_or_404(
            scope_queryset(Position.objects.all(), request.user), pk=pk
        )
        return Response(PositionSerializer(position).data)

    def post(self, request):
        serializer = PositionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            get_scoped_election_or_404(request.user, serializer.validated_data["election"].pk)
        except Election.DoesNotExist:
            raise ParseError("Election not found.")
        with ballot_change_transaction(serializer.validated_data["election"].pk):
            position = serializer.save()
        return Response(PositionSerializer(position).data, status=status.HTTP_201_CREATED)

    def put(self, request, pk):
        position = get_object_or_404(
            scope_queryset(Position.objects.all(), request.user), pk=pk
        )
        serializer = PositionSerializer(
            position,
            data=request.data,
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        if "election" in serializer.validated_data:
            try:
                get_scoped_election_or_404(request.user, serializer.validated_data["election"].pk)
            except Election.DoesNotExist:
                raise ParseError("Election not found.")
        target = serializer.validated_data.get("election", position.election)
        with ballot_change_transaction(position.election_id, target.pk):
            position = serializer.save()
        return Response(
            PositionSerializer(position).data,
            status=status.HTTP_200_OK
        )

    def patch(self, request, pk):
        return self.put(request, pk)

    def delete(self, request, pk):
        position = get_object_or_404(
            scope_queryset(Position.objects.all(), request.user), pk=pk
        )
        try:
            with ballot_change_transaction(position.election_id):
                position.delete()
        except ProtectedError:
            return Response(
                {"detail": "Position cannot be deleted because votes exist for it."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {"detail": "Position deleted successfully"},
            status=status.HTTP_204_NO_CONTENT
        )


class CandidateViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only candidate data requires an authenticated admin or voter context.
    Expects `?position_id=` as a query parameter.
    """
    serializer_class = CandidateSerializer
    permission_classes = [IsElectionDataViewer]
    authentication_classes = [JWTAuthentication, VoterAuthentication]

    def get_queryset(self):
        queryset = scope_queryset(Candidate.objects.all(), self.request.user, "position__election_id")
        position_id = self.request.query_params.get("position_id")
        if position_id:
            return queryset.filter(position_id=position_id).order_by('ballot_number')
        return Candidate.objects.none()


class CandidateCreateView(APIView):
    """
    Staff or superuser can register candidates for positions.
    """
    permission_classes = [IsStaffOrSuperUser]
    authentication_classes = [JWTAuthentication, VoterAuthentication]

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsElectionDataViewer()]
        return [IsStaffOrSuperUser()]

    def get(self, request, pk):
        candidate = get_object_or_404(
            scope_queryset(Candidate.objects.all(), request.user, "position__election_id"),
            pk=pk,
        )
        return Response(CandidateSerializer(candidate).data)

    # CREATE
    def post(self, request):
        position_id = request.data.get("position")
        if position_id is not None:
            get_object_or_404(
                scope_queryset(Position.objects.all(), request.user), pk=position_id
            )
        serializer = CandidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            get_scoped_election_or_404(
                request.user, serializer.validated_data["position"].election_id
            )
        except Election.DoesNotExist:
            raise ParseError("Election not found.")
        election_id = serializer.validated_data["position"].election_id
        with ballot_change_transaction(election_id):
            candidate = serializer.save()
        return Response(CandidateSerializer(candidate).data, status=status.HTTP_201_CREATED)

    # EDIT
    def put(self, request, pk):
        candidate = get_object_or_404(
            scope_queryset(Candidate.objects.all(), request.user, "position__election_id"),
            pk=pk,
        )
        serializer = CandidateSerializer(
            candidate,
            data=request.data,
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        effective_position = serializer.validated_data.get("position", candidate.position)
        try:
            get_scoped_election_or_404(request.user, effective_position.election_id)
        except Election.DoesNotExist:
            raise ParseError("Election not found.")
        with ballot_change_transaction(
            candidate.position.election_id, effective_position.election_id
        ):
            candidate = serializer.save()
        return Response(
            CandidateSerializer(candidate).data,
            status=status.HTTP_200_OK
        )

    def patch(self, request, pk):
        return self.put(request, pk)

    # DELETE
    def delete(self, request, pk):
        candidate = get_object_or_404(
            scope_queryset(Candidate.objects.all(), request.user, "position__election_id"),
            pk=pk,
        )
        try:
            with ballot_change_transaction(candidate.position.election_id):
                candidate.delete()
        except ProtectedError:
            return Response(
                {"detail": "Candidate cannot be deleted because votes exist for it."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {"detail": "Candidate deleted successfully"},
            status=status.HTTP_204_NO_CONTENT
        )


class ElectionManageView(APIView):
    """
    Staff or superuser can enable or pause voting for an election.
    """

    permission_classes = [IsStaffOrSuperUser]
    
    security_logger = logging.getLogger('security')

    def get(self, request):
        elections = scope_queryset(
            Election.objects.all(), request.user, "id"
        ).order_by('-year', '-start_time')
        serializer = ElectionSerializer(elections, many=True)
        return Response(serializer.data)

    def patch(self, request):
        """
        Accepts JSON: { "election_id": 1, "voting_enabled": true }.
        The deprecated `is_active` input alias remains during frontend rollout.
        Multiple elections can have voting enabled simultaneously.
        """
        toggle_serializer = ElectionToggleSerializer(data=request.data)
        toggle_serializer.is_valid(raise_exception=True)
        election_id = toggle_serializer.validated_data["election_id"]
        voting_enabled = toggle_serializer.validated_data["voting_enabled"]
        
        # Get client IP and user for logging
        client_ip = request.META.get('REMOTE_ADDR')
        user = request.user

        try:
            election = get_scoped_election_or_404(request.user, election_id)
        except Election.DoesNotExist:
            return Response(
                {"detail": "Election not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            # Multiple elections remain independently enableable.
            election = Election.objects.select_for_update().get(pk=election.pk)
            if election_status(election) == "ended":
                return Response(
                    {"detail": "Ended elections cannot be changed."},
                    status=status.HTTP_409_CONFLICT,
                )
            if voting_enabled and not election_ballot_ready(election):
                return Response(
                    {
                        "detail": (
                            "Configure at least one position and add at least one candidate "
                            "to every position before enabling voting."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            election.voting_enabled = voting_enabled
            election.save(update_fields=["voting_enabled"])
            
            action = "ENABLED" if voting_enabled else "PAUSED"
            self.security_logger.info(
                f"ELECTION_VOTING_{action}: election_id={election_id}, election_name={election.name}, "
                f"user={user.username if user else 'unknown'}, ip={client_ip}"
            )

        payload = ElectionSerializer(election).data
        payload["detail"] = "Voting enabled." if voting_enabled else "Voting paused."
        return Response(payload, status=status.HTTP_200_OK)


class ElectionScheduleUpdateView(APIView):
    """Update both schedule times while an election is still scheduled."""

    permission_classes = [IsStaffOrSuperUser]

    def patch(self, request, election_id):
        serializer = ElectionScheduleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        start_time = serializer.validated_data["start_time"]
        end_time = serializer.validated_data["end_time"]

        try:
            with transaction.atomic():
                election = get_scoped_election_or_404(request.user, election_id)
                election = Election.objects.select_for_update().get(pk=election.pk)

                if election_status(election) != "scheduled":
                    return Response(
                        {"detail": "Only scheduled elections can have their schedule changed."},
                        status=status.HTTP_409_CONFLICT,
                    )
                if election_has_votes(election.pk):
                    return Response(
                        {"detail": "The schedule cannot be changed after votes have been recorded."},
                        status=status.HTTP_409_CONFLICT,
                    )
                if start_time <= timezone.now():
                    return Response(
                        {"start_time": ["The new start time must be in the future."]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                old_start_time = election.start_time
                old_end_time = election.end_time
                election.start_time = start_time
                election.end_time = end_time
                election.full_clean()
                election.save(update_fields=["start_time", "end_time"])

                LogEntry.objects.create(
                    user=request.user,
                    content_type=ContentType.objects.get_for_model(Election),
                    object_id=str(election.pk),
                    object_repr=str(election),
                    action_flag=CHANGE,
                    change_message=(
                        "Election schedule changed from "
                        f"{old_start_time.isoformat()} – {old_end_time.isoformat()} to "
                        f"{start_time.isoformat()} – {end_time.isoformat()}."
                    ),
                )
        except Election.DoesNotExist:
            return Response(
                {"detail": "Election not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except DjangoValidationError as exc:
            return Response(
                getattr(exc, "message_dict", {"detail": exc.messages}),
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = ElectionSerializer(election).data
        payload["detail"] = "Election schedule updated."
        return Response(payload, status=status.HTTP_200_OK)


class ElectionEndTimeExtensionView(APIView):
    """Extend an open or paused election's closing time with an audit reason."""

    permission_classes = [IsStaffOrSuperUser]

    def post(self, request, election_id):
        serializer = ElectionEndTimeExtensionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_end_time = serializer.validated_data["end_time"]
        reason = serializer.validated_data["reason"]

        try:
            with transaction.atomic():
                election = get_scoped_election_or_404(request.user, election_id)
                election = Election.objects.select_for_update().get(pk=election.pk)

                if election_status(election) not in {"open", "paused"}:
                    return Response(
                        {"detail": "The closing time can only be extended while the election is open or paused."},
                        status=status.HTTP_409_CONFLICT,
                    )

                if new_end_time <= election.end_time:
                    return Response(
                        {"end_time": ["The new closing time must be later than the current closing time."]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                old_end_time = election.end_time
                election.end_time = new_end_time
                # Extending the voting window is allowed after votes exist; it
                # does not change any ballot configuration or the start time.
                election.save(update_fields=["end_time"])

                LogEntry.objects.create(
                    user=request.user,
                    content_type=ContentType.objects.get_for_model(Election),
                    object_id=str(election.pk),
                    object_repr=str(election),
                    action_flag=CHANGE,
                    change_message=(
                        "Election closing time extended from "
                        f"{old_end_time.isoformat()} to {new_end_time.isoformat()}. "
                        f"Reason: {reason}"
                    ),
                )
        except Election.DoesNotExist:
            return Response(
                {"detail": "Election not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = ElectionSerializer(election).data
        payload["detail"] = "Election closing time extended."
        return Response(payload, status=status.HTTP_200_OK)


class MultiVoteView(APIView):
    """
    Students authenticate via headers using `VoterAuthentication`.
    View enforces activation, single-vote, and transactional locking.
    """
    authentication_classes = [VoterAuthentication]
    permission_classes = [IsAuthenticated]
    
    security_logger = logging.getLogger('security')
    
    def post(self, request):
        # Apply rate limiting only in production
        from django.conf import settings
        if getattr(settings, 'RATE_LIMITING_ENABLED', False):
            from django_ratelimit.decorators import ratelimit
            from django.utils.decorators import method_decorator
            
            @method_decorator(ratelimit(key='ip', rate='10/m', method='POST'))
            def rate_limited_post(self, request):
                return self._actual_post(request)
            return rate_limited_post(self, request)
        else:
            return self._actual_post(request)
    
    def _actual_post(self, request):
        serializer = MultiVoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # `request.user` is StudentUser from VoterAuthentication
        student_user = getattr(request.user, "student", None)
        token = getattr(request, "auth", None)
        if student_user is None or token is None:
            raise ParseError("Student authentication required via headers.")

        # Get client IP for logging
        client_ip = request.META.get('REMOTE_ADDR')
        
        # Log vote attempt
        self.security_logger.info(
            f"VOTE_ATTEMPT: student_id={student_user.student_id if student_user else 'unknown'}, "
            f"ip={client_ip}, election_ids={[v['election'] for v in data['votes']]}"
        )

        try:
            with transaction.atomic():
                # Lock fresh student row to avoid races
                student = Student.objects.select_for_update().get(
                    pk=student_user.pk
                )

                authenticated_election_id = request.META.get("HTTP_X_ELECTION_ID")
                if str(student.election_id) != str(authenticated_election_id):
                    return Response(
                        {"detail": "Voter election context is invalid."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                now = timezone.now()

                if not getattr(student, "is_active", False):
                    self.security_logger.warning(
                        f"VOTE_DENIED_INACTIVE: student_id={student.student_id}, ip={client_ip}"
                    )
                    return Response(
                        {"detail": "Student is not activated to vote."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                if getattr(student, "has_voted", False):
                    self.security_logger.warning(
                        f"VOTE_DENIED_ALREADY_VOTED: student_id={student.student_id}, ip={client_ip}"
                    )
                    return Response(
                        {"detail": "Student has already voted."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                election_position_ids = set(
                    Position.objects.filter(
                        election_id=student.election_id
                    ).values_list("id", flat=True)
                )
                submitted_position_ids = [vote["position"] for vote in data["votes"]]
                if (
                    len(submitted_position_ids) != len(election_position_ids)
                    or set(submitted_position_ids) != election_position_ids
                ):
                    return Response(
                        {
                            "detail": (
                                "A complete ballot must contain exactly one selection "
                                "for every position in the election."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                votes_to_create = []
                authenticated_election = (
                    Election.objects.select_for_update()
                    .filter(pk=student.election_id)
                    .first()
                )
                if authenticated_election is None:
                    return Response(
                        {"detail": "Election not found."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                lifecycle = election_lifecycle(
                    authenticated_election, now, include_candidate_lock=False
                )
                if not lifecycle["voting_open"]:
                    detail = {
                        "scheduled": "Voting has not started yet.",
                        "paused": "Voting is paused for this election.",
                        "ended": "Voting has ended.",
                    }.get(lifecycle["status"], "Voting is not open.")
                    return Response(
                        {"detail": detail}, status=status.HTTP_403_FORBIDDEN
                    )
                if not election_ballot_ready(authenticated_election):
                    return Response(
                        {
                            "detail": (
                                "Voting is unavailable because the ballot is not ready. "
                                "Please contact an administrator."
                            )
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
                if not student_can_vote_now(student, authenticated_election, now):
                    return Response(
                        {"detail": "Student is not eligible to vote now."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                election_cache = {student.election_id: authenticated_election}
                position_cache = {}
                candidate_cache = {}
                for vote_data in data["votes"]:
                    election_id = vote_data["election"]
                    position_id = vote_data["position"]
                    candidate_id = vote_data["candidate"]
                    choice = vote_data.get("choice", "candidate")

                    if (
                        str(election_id) != str(authenticated_election_id)
                        or election_id != student.election_id
                    ):
                        return Response(
                            {"detail": "Every vote must belong to the authenticated election."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    election = election_cache.get(election_id)
                    if election is None:
                        election = (
                            Election.objects.filter(pk=election_id)
                            .select_for_update()
                            .first()
                        )
                        election_cache[election_id] = election
                    if election is None:
                        return Response(
                            {"detail": "Election does not exist."},
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

                    if candidate.student.election_id != election.pk:
                        return Response(
                            {"detail": "Candidate does not belong to election."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    voting_mode = position_voting_mode(position)
                    if voting_mode == "yes_no" and choice not in {"yes", "no"}:
                        return Response(
                            {
                                "detail": (
                                    "This position requires a Yes or No approval choice."
                                )
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    if voting_mode == "candidate" and choice != "candidate":
                        return Response(
                            {
                                "detail": (
                                    "This position requires a candidate selection."
                                )
                            },
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
                            choice=choice,
                        )
                    )

                Vote.objects.bulk_create(votes_to_create)

                # Mark student as voted and deactivate
                student.has_voted = True
                student.is_active = False
                student.save(update_fields=["has_voted", "is_active"])
                
                # Log successful vote
                self.security_logger.info(
                    f"VOTE_SUCCESS: student_id={student.student_id}, ip={client_ip}, "
                    f"votes_count={len(votes_to_create)}, election_ids={[v.election_id for v in votes_to_create]}"
                )

        except Student.DoesNotExist:
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            self.security_logger.exception(
                "VOTE_SUBMISSION_FAILED: student_id=%s, ip=%s",
                getattr(student_user, "student_id", "unknown"),
                client_ip,
            )
            return Response(
                {"detail": "Vote submission could not be completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"detail": "All votes submitted successfully.", "can_vote_now": False},
            status=status.HTTP_201_CREATED,
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            "username": user.username,
            "role": user.role,
            "assigned_election": (
                {
                    "id": user.assigned_election.id,
                    "name": user.assigned_election.name,
                    "year": user.assigned_election.year,
                    "voting_enabled": user.assigned_election.voting_enabled,
                    **election_lifecycle(user.assigned_election),
                }
                if user.assigned_election_id
                else None
            ),
        })


class StudentActivationView(APIView):
    """
    Toggle `is_active` on a Student within the staff/activator's election scope.
    Accepts JSON: { "student_id": "S12345", "election_id": 1, "is_active": true }
    """
    permission_classes = [CanActivateVoters]
    
    security_logger = logging.getLogger('security')
    
    def post(self, request):
        # Apply rate limiting only in production
        from django.conf import settings
        if getattr(settings, 'RATE_LIMITING_ENABLED', False):
            from django_ratelimit.decorators import ratelimit
            from django.utils.decorators import method_decorator
            
            @method_decorator(ratelimit(key='ip', rate='11/m', method='POST'))
            def rate_limited_post(self, request):
                return self._actual_post(request)
            return rate_limited_post(self, request)
        else:
            return self._actual_post(request)
    
    def _actual_post(self, request):
        print("INSIDE ACTIVATION VIEW - POST CALLED")  # ← add this
        print(request.path, request.method)
        
        # Get client IP and user for logging
        client_ip = request.META.get('REMOTE_ADDR')
        user = request.user
        
        student_id = request.data.get("student_id")
        election_id = request.data.get("election_id")
        
        # Log activation attempt
        self.security_logger.info(
            f"ACTIVATION_ATTEMPT: student_id={student_id}, election_id={election_id}, "
            f"user={user.username if user else 'unknown'}, ip={client_ip}"
        )
        
        if not student_id:
            return Response(
                {"detail": "student_id required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
            
        if not election_id:
            return Response(
                {"detail": "election_id required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_active = request.data.get("is_active")
        if is_active is None:
            return Response(
                {"detail": "is_active required."},
                status=status.HTTP_400_BAD_REQUEST,
            )



        try:
            election = get_scoped_election_or_404(request.user, election_id)
        except Election.DoesNotExist:
            return Response(
                {"detail": "Election not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        is_active = serializers.BooleanField().run_validation(is_active)

        try:
            # Find student by both student_id and election_id
            student = Student.objects.get(student_id=student_id, election_id=election_id)
        except Student.DoesNotExist:
            return Response(
                {"detail": "Student not found in this election."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if is_active:
            lifecycle_status = election_status(election)
            if lifecycle_status == "scheduled":
                return Response(
                    {"detail": "Voters can only be activated while voting is open."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if lifecycle_status == "paused":
                return Response(
                    {"detail": "Voters cannot be activated while voting is currently paused."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if lifecycle_status == "ended":
                return Response(
                    {"detail": "Voters cannot be activated after voting has ended."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not election_ballot_ready(election):
                return Response(
                    {
                        "detail": (
                            "Add at least one position and at least one candidate to every "
                            "position before activating voters."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Check if student has already voted (cannot be activated if voted)
        if student.has_voted:
            self.security_logger.warning(
                f"ACTIVATION_DENIED_VOTED: student_id={student_id}, election_id={election_id}, "
                f"user={user.username if user else 'unknown'}, ip={client_ip}"
            )
            return Response(
                {"detail": "Student has already voted and cannot be re-activated."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check current status for better message
        current_status = student.is_active
        new_status = is_active

        if current_status == new_status:
            status_text = "active" if current_status else "inactive"
            return Response(
                {"detail": f"Student is already {status_text}."},
                status=status.HTTP_200_OK,
            )

        # Only toggle the is_active flag
        student.is_active = new_status
        student.save(update_fields=["is_active"])
        
        # Log successful activation/deactivation
        action = "ACTIVATED" if new_status else "DEACTIVATED"
        self.security_logger.info(
            f"STUDENT_{action}: student_id={student_id}, election_id={election_id}, "
            f"user={user.username if user else 'unknown'}, ip={client_ip}"
        )

        status_text = "activated" if new_status else "deactivated"
        return Response(
            {"detail": f"Student {status_text} successfully."},
            status=status.HTTP_200_OK,
        )


class ElectionCreateView(APIView):
    """
    Only a superuser can create an election because creation is a global
    operation and cannot be scoped to a staff member's assigned election.
    """
    permission_classes = [IsSuperUser]

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
    
    security_logger = logging.getLogger('security')
    
    def post(self, request):
        # Apply rate limiting only in production
        from django.conf import settings
        
        if getattr(settings, 'RATE_LIMITING_ENABLED', False):
            from django_ratelimit.decorators import ratelimit
            from django.utils.decorators import method_decorator
            
            @method_decorator(ratelimit(key='ip', rate='5/m', method='POST'))
            def rate_limited_post(self, request):
                return self._actual_post(request)
            return rate_limited_post(self, request)
        else:
            return self._actual_post(request)
    
    def _actual_post(self, request):
        student_id = request.data.get("student_id")
        
        # Get client IP for logging
        client_ip = request.META.get('REMOTE_ADDR')
        
        # Log login attempt
        self.security_logger.info(
            f"LOGIN_ATTEMPT: student_id={student_id}, ip={client_ip}"
        )

        if not student_id:
            return Response(
                {"detail": "student_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        matching_students = list(
            Student.objects.filter(student_id=student_id).select_related("election")
        )
        if not matching_students:
            self.security_logger.warning(
                f"LOGIN_NOT_FOUND: student_id={student_id}, ip={client_ip}"
            )
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        status_by_election = {
            student.election_id: election_status(student.election, now)
            for student in matching_students
        }
        open_students = [
            student for student in matching_students
            if status_by_election[student.election_id] == "open"
        ]
        eligible_students = [
            student for student in open_students
            if election_ballot_ready(student.election)
            and student_can_vote_now(student, student.election, now)
        ]
        if len(eligible_students) == 1:
            student = eligible_students[0]
            active_election = student.election
        elif len(eligible_students) > 1:
            return Response(
                {"detail": "Student is eligible to vote in multiple elections. Please contact an administrator."},
                status=status.HTTP_409_CONFLICT,
            )
        elif open_students:
            if len(open_students) > 1:
                return Response(
                    {"detail": "Student ID is associated with more than one open election."},
                    status=status.HTTP_409_CONFLICT,
                )
            open_student = open_students[0]
            if not election_ballot_ready(open_student.election):
                return Response(
                    {
                        "detail": (
                            "Voting is unavailable because the ballot is not ready. "
                            "Please contact an administrator."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            if open_student.has_voted:
                self.security_logger.warning(
                    f"LOGIN_DENIED_VOTED: student_id={student_id}, ip={client_ip}"
                )
                return Response(
                    {"detail": "Student has already voted."},
                    status=status.HTTP_409_CONFLICT,
                )
            self.security_logger.warning(
                f"LOGIN_DENIED_INACTIVE: student_id={student_id}, ip={client_ip}"
            )
            return Response(
                {"detail": "Student is not activated to vote."},
                status=status.HTTP_403_FORBIDDEN,
            )
        else:
            states = set(status_by_election.values())
            if "paused" in states:
                detail = "Voting is currently paused. Please try again later."
            elif "scheduled" in states:
                detail = "Voting has not started yet."
            else:
                detail = "Voting has ended."
            return Response({"detail": detail}, status=status.HTTP_403_FORBIDDEN)

        # Generate HMAC token (include election_id to scope the token)
        token = generate_voter_hmac(f"{student.student_id}_{active_election.id}")
        
        # Log successful login
        self.security_logger.info(
            f"LOGIN_SUCCESS: student_id={student.student_id}, election_id={active_election.id}, ip={client_ip}"
        )

        election_lifecycle_data = election_lifecycle(
            active_election, now, include_candidate_lock=False
        )
        return Response({
            "token": token,
            "can_vote_now": student_can_vote_now(student, active_election, now),
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
                "voting_enabled": active_election.voting_enabled,
                **election_lifecycle_data,
            }
        }, status=status.HTTP_200_OK)


class ElectionStatsView(APIView):
    """Get basic election statistics"""
    permission_classes = [IsStaffOrSuperUser]

    def get(self, request, election_id):
        try:
            election = get_scoped_election_or_404(request.user, election_id)
        except Election.DoesNotExist:
            return Response(
                {"detail": "Election not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        total_voters = Student.objects.filter(election=election).count()
        voters_voted = Student.objects.filter(election=election, has_voted=True).count()

        return Response({
            "election_id": election.id,
            "election_name": election.name,
            "voting_enabled": election.voting_enabled,
            **election_lifecycle(election),
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
            position = get_object_or_404(
                scope_queryset(Position.objects.all(), request.user), pk=position_id
            )
        except Position.DoesNotExist:
            return Response(
                {"detail": "Position not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        election = position.election

        # Unique voters who cast any vote in this election
        unique_voters = Vote.objects.filter(election=election).values('voter_hash').distinct().count()

        # Votes actually cast for this position
        position_votes = Vote.objects.filter(
            election=election,
            position=position
        ).count()

        skipped = max(0, unique_voters - position_votes)
        voting_mode = position_voting_mode(position)
        # Legacy candidate-only votes on a single-candidate position represent approval.
        yes_votes = Vote.objects.filter(
            election=election,
            position=position,
            choice__in=["yes", "candidate"] if voting_mode == VOTING_MODE_YES_NO else ["yes"],
        ).count()
        no_votes = Vote.objects.filter(
            election=election, position=position, choice="no"
        ).count()

        return Response({
            "position_id": position.id,
            "position_name": position.name,
            "election": election.name,
            "voting_mode": voting_mode,
            "voting_enabled": election.voting_enabled,
            **election_lifecycle(election),
            "unique_voters_in_election": unique_voters,
            "votes_for_this_position": position_votes,
            "skipped_votes": skipped,
            "skip_percentage": round((skipped / unique_voters * 100), 2) if unique_voters > 0 else 0.0,
            "yes_votes": yes_votes,
            "no_votes": no_votes,
            "approved": (
                yes_votes > no_votes
                if voting_mode == "yes_no" and yes_votes + no_votes > 0
                else None
            ),
        })


class ElectionResultsView(APIView):
    """Get comprehensive results for an entire election"""
    permission_classes = [IsStaffOrSuperUser]

    def get(self, request, election_id):
        try:
            election = get_scoped_election_or_404(request.user, election_id)
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
            candidates = Candidate.objects.filter(position=position).order_by('ballot_number')

            candidate_results = []
            voting_mode = position_voting_mode(position)
            yes_votes = 0
            no_votes = 0

            if voting_mode == "yes_no":
                candidate = candidates.first()
                # Historical rows predate Vote.choice and default to candidate.
                yes_votes = Vote.objects.filter(
                    election=election,
                    position=position,
                    choice__in=["yes", "candidate"],
                ).count()
                no_votes = Vote.objects.filter(
                    election=election,
                    position=position,
                    choice="no",
                ).count()
                if candidate:
                    candidate_results.append({
                        "id": candidate.id,
                        "student_id": candidate.student.student_id,
                        "candidate_name": candidate.student.full_name,
                        "photo_url": candidate.photo_url or "",
                        "ballot_number": candidate.ballot_number,
                        "vote_count": yes_votes,
                        "yes_votes": yes_votes,
                        "no_votes": no_votes,
                    })
            else:
                for candidate in candidates:
                    vote_count = Vote.objects.filter(
                        election=election,
                        candidate=candidate,
                        position=position,
                        choice="candidate",
                    ).count()

                    candidate_results.append({
                        "id": candidate.id,
                        "student_id": candidate.student.student_id,
                        "candidate_name": candidate.student.full_name,
                        "photo_url": candidate.photo_url or "",
                        "ballot_number": candidate.ballot_number,
                        "vote_count": vote_count,
                    })

            total_valid_votes_this_position = yes_votes + no_votes
            if voting_mode == "candidate":
                total_valid_votes_this_position = sum(
                    candidate["vote_count"] for candidate in candidate_results
                )

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
                "voting_mode": voting_mode,
                "total_valid_votes": total_valid_votes_this_position,
                "skipped_votes": skipped,
                "skip_percentage": round((skipped / unique_voters * 100), 2) if unique_voters > 0 else 0.0,
                "yes_votes": yes_votes,
                "no_votes": no_votes,
                "approved": (
                    yes_votes > no_votes
                    if voting_mode == "yes_no" and total_valid_votes_this_position > 0
                    else None
                ),
                "candidates": candidate_results,
            })

        # Overall election stats
        total_students = Student.objects.filter(election=election).count()
        students_who_voted = Student.objects.filter(election=election, has_voted=True).count()

        return Response({
            "election_id": election.id,
            "election_name": election.name,
            "year": election.year,
            "voting_enabled": election.voting_enabled,
            **election_lifecycle(election),
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
            position = get_object_or_404(
                scope_queryset(Position.objects.all(), request.user), pk=position_id
            )
            candidates = Candidate.objects.filter(position_id=position_id).select_related('student').order_by('ballot_number')
        except (ValueError, Position.DoesNotExist):
            return Response(
                {"detail": "Position not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        result = []
        voting_mode = position_voting_mode(position)

        for candidate in candidates:
            vote_count = Vote.objects.filter(
                election=position.election,
                candidate_id=candidate.id,
                position_id=position_id,
                choice__in=(
                    ["yes", "candidate"]
                    if voting_mode == VOTING_MODE_YES_NO
                    else ["candidate"]
                ),
            ).count()

            candidate_data = {
                "candidate_id": candidate.id,
                "candidate_name": candidate.student.full_name,
                "student_id": candidate.student.student_id,
                "positionid": int(position_id),  # Add position_id to response
                "vote_count": vote_count,
                "voting_mode": voting_mode,
            }

            result.append(candidate_data)

        return Response(result, status=status.HTTP_200_OK)


class ImageUploadView(APIView):
    """
    Upload candidate photos.
    - In production (Cloudinary configured): uploads to Cloudinary
    - In development (no Cloudinary): saves to local media folder
    """
    permission_classes = [IsStaffOrSuperUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        from django.conf import settings
        import uuid
        import os

        file = request.FILES.get('image')
        if not file:
            return Response(
                {"detail": "No image file provided."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate file type
        allowed_types = ['image/jpeg', 'image/png', 'image/webp']
        if file.content_type not in allowed_types:
            return Response(
                {"detail": "Invalid file type. Allowed: JPEG, PNG, WebP."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate file size (max 5MB)
        max_size = 5 * 1024 * 1024
        if file.size > max_size:
            return Response(
                {"detail": "File too large. Maximum size is 5MB."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if Cloudinary is configured (production)
        cloud_name = settings.CLOUDINARY_CLOUD_NAME
        api_key = settings.CLOUDINARY_API_KEY
        api_secret = settings.CLOUDINARY_API_SECRET

        if cloud_name and api_key and api_secret:
            # Production: Upload to Cloudinary
            try:
                import cloudinary
                import cloudinary.uploader

                cloudinary.config(
                    cloud_name=cloud_name,
                    api_key=api_key,
                    api_secret=api_secret
                )

                result = cloudinary.uploader.upload(
                    file,
                    folder="evoting/candidates",
                    transformation=[
                        {"width": 400, "height": 400, "crop": "fill", "gravity": "face"}
                    ]
                )

                return Response({
                    "url": result["secure_url"],
                    "public_id": result["public_id"],
                    "storage": "cloudinary"
                }, status=status.HTTP_201_CREATED)

            except Exception as e:
                return Response(
                    {"detail": f"Cloudinary upload failed: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        else:
            # Development: Save to local media folder
            try:
                # Ensure media directory exists
                media_path = os.path.join(settings.MEDIA_ROOT, 'candidates')
                os.makedirs(media_path, exist_ok=True)

                # Generate unique filename
                ext = file.name.split('.')[-1] if '.' in file.name else 'jpg'
                filename = f"{uuid.uuid4().hex}.{ext}"
                filepath = os.path.join(media_path, filename)

                # Save file
                with open(filepath, 'wb+') as destination:
                    for chunk in file.chunks():
                        destination.write(chunk)

                # Return full URL (include host for frontend to access)
                # Build absolute URL from request
                relative_url = f"{settings.MEDIA_URL}candidates/{filename}"
                url = request.build_absolute_uri(relative_url)

                return Response({
                    "url": url,
                    "filename": filename,
                    "storage": "local"
                }, status=status.HTTP_201_CREATED)

            except Exception as e:
                return Response(
                    {"detail": f"Local upload failed: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
