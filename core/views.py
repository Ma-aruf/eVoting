from io import BytesIO
import logging

from django.conf import settings

from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import ProtectedError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework import serializers, status, viewsets
from rest_framework.exceptions import ParseError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .authentication import VoterAuthentication
from .ballot_operations import lock_elections_for_ballot_change
from .result_views import (
    CandidatesForPositionView,
    ElectionResultsView,
    ElectionStatsView,
    PositionStatsView,
)
from .election_access import get_scoped_election_or_404, scope_queryset
from .election_lifecycle import (
    VOTING_MODE_YES_NO,
    election_ballot_ready,
    election_lifecycle,
    election_status,
    position_voting_mode,
    student_can_vote_now,
)
from .media_views import ImageUploadView
from .models import Candidate, Election, Position, Student, Vote
from .permissions import (
    CanAccessStudents,
    CanActivateVoters,
    IsElectionDataViewer,
    IsManagementUser,
    IsStaffOrSuperUser,
    IsSuperUser,
)
from .serializers import (
    BulkStudentUploadSerializer,
    CandidateSerializer,
    ElectionEndTimeExtensionSerializer,
    ElectionScheduleUpdateSerializer,
    ElectionSerializer,
    ElectionToggleSerializer,
    MultiVoteSerializer,
    PositionSerializer,
    StudentSerializer,
    UserSerializer,
)
from .utils import (
    VOTER_PIN_MAX_ATTEMPTS,
    create_voter_token,
    deactivate_expired_voter,
    deactivate_expired_voters,
    election_has_votes,
    generate_voter_pin,
    hash_voter_pin,
    verify_voter_pin,
    voter_access_expired,
    voter_session_expiry,
    student_has_current_voter_access,
)

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
    """
    Election data is available only to scoped management accounts.
    """
    queryset = Election.objects.all()
    serializer_class = ElectionSerializer
    permission_classes = [IsManagementUser]

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
    permission_classes = [CanAccessStudents]

    def get_queryset(self):
        # Keep stored activation status current when staff load voter lists.
        deactivate_expired_voters()
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
        with lock_elections_for_ballot_change(election.pk):
            serializer.save()

    def perform_update(self, serializer):
        position = serializer.instance
        target = serializer.validated_data.get("election", position.election)
        get_scoped_election_or_404(self.request.user, target.pk)
        with lock_elections_for_ballot_change(position.election_id, target.pk):
            serializer.save()

    def perform_destroy(self, instance):
        with lock_elections_for_ballot_change(instance.election_id):
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
        with lock_elections_for_ballot_change(serializer.validated_data["election"].pk):
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
        with lock_elections_for_ballot_change(position.election_id, target.pk):
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
            with lock_elections_for_ballot_change(position.election_id):
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
        with lock_elections_for_ballot_change(election_id):
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
        with lock_elections_for_ballot_change(
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
            with lock_elections_for_ballot_change(candidate.position.election_id):
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
                    candidate_id = vote_data.get("candidate")
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

                    candidate = None
                    if choice != "skip":
                        if candidate_id is None:
                            return Response(
                                {"detail": "A candidate is required unless the position is skipped."},
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
                    elif candidate_id is not None:
                        return Response(
                            {"detail": "A skipped position cannot include a candidate."},
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

                # Mark student as voted and end the session.
                student.has_voted = True
                student.is_active = False
                student.voting_pin_hash = ""
                student.voting_pin_created_at = None
                student.voting_pin_attempts = 0
                student.voter_session_expires_at = None
                student.save(
                    update_fields=[
                        "has_voted",
                        "is_active",
                        "voting_pin_hash",
                        "voting_pin_created_at",
                        "voting_pin_attempts",
                        "voter_session_expires_at",
                    ]
                )

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
    """Activate or deactivate a voter within the user's election scope."""

    permission_classes = [CanActivateVoters]
    security_logger = logging.getLogger("security")

    def post(self, request):
        if getattr(settings, "RATE_LIMITING_ENABLED", False):
            from django_ratelimit.decorators import ratelimit
            from django.utils.decorators import method_decorator

            @method_decorator(ratelimit(key="ip", rate="11/m", method="POST"))
            def rate_limited_post(view, current_request):
                return view._actual_post(current_request)

            return rate_limited_post(self, request)

        return self._actual_post(request)

    def _actual_post(self, request):
        client_ip = request.META.get("REMOTE_ADDR")
        user = request.user
        student_id = request.data.get("student_id")
        election_id = request.data.get("election_id")
        is_active = request.data.get("is_active")

        self.security_logger.info(
            "ACTIVATION_ATTEMPT: student_id=%s, election_id=%s, user=%s, ip=%s",
            student_id,
            election_id,
            getattr(user, "username", "unknown"),
            client_ip,
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
            student = Student.objects.get(
                student_id=student_id,
                election_id=election_id,
            )
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

        if student.has_voted:
            self.security_logger.warning(
                "ACTIVATION_DENIED_VOTED: student_id=%s, election_id=%s, user=%s, ip=%s",
                student_id,
                election_id,
                getattr(user, "username", "unknown"),
                client_ip,
            )
            return Response(
                {"detail": "Student has already voted and cannot be re-activated."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if student_has_current_voter_access(student) == is_active:
            status_text = "active" if is_active else "inactive"
            return Response(
                {"detail": f"Student is already {status_text}.", "voting_pin": None},
                status=status.HTTP_200_OK,
            )

        pin = None
        if is_active:
            pin = generate_voter_pin()
            student.is_active = True
            student.voting_pin_hash = hash_voter_pin(pin)
            student.voting_pin_created_at = timezone.now()
            student.voting_pin_attempts = 0
            student.voter_session_expires_at = None
        else:
            student.is_active = False
            student.voting_pin_hash = ""
            student.voting_pin_created_at = None
            student.voting_pin_attempts = 0
            student.voter_session_expires_at = None

        student.save(
            update_fields=[
                "is_active",
                "voting_pin_hash",
                "voting_pin_created_at",
                "voting_pin_attempts",
                "voter_session_expires_at",
            ]
        )

        action = "ACTIVATED" if is_active else "DEACTIVATED"
        self.security_logger.info(
            "STUDENT_%s: student_id=%s, election_id=%s, user=%s, ip=%s",
            action,
            student_id,
            election_id,
            getattr(user, "username", "unknown"),
            client_ip,
        )

        status_text = "activated" if is_active else "deactivated"
        return Response(
            {"detail": f"Student {status_text} successfully.", "voting_pin": pin},
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
    """Authenticate an activated voter with their one-time PIN."""

    permission_classes = [AllowAny]
    security_logger = logging.getLogger("security")

    def post(self, request):
        if getattr(settings, "RATE_LIMITING_ENABLED", False):
            from django_ratelimit.decorators import ratelimit
            from django.utils.decorators import method_decorator

            @method_decorator(ratelimit(key="ip", rate="5/m", method="POST"))
            def rate_limited_post(view, current_request):
                return view._actual_post(current_request)

            return rate_limited_post(self, request)

        return self._actual_post(request)

    def _actual_post(self, request):
        student_id = request.data.get("student_id")
        pin = request.data.get("pin")

        if not student_id:
            return Response(
                {"detail": "student_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        client_ip = request.META.get("REMOTE_ADDR")
        self.security_logger.info(
            "LOGIN_ATTEMPT: student_id=%s, ip=%s",
            student_id,
            client_ip,
        )

        now = timezone.now()
        matching_students = list(
            Student.objects.filter(student_id=student_id).select_related("election")
        )
        if not matching_students:
            self.security_logger.warning(
                "LOGIN_NOT_FOUND: student_id=%s, ip=%s",
                student_id,
                client_ip,
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
            student
            for student in matching_students
            if status_by_election[student.election_id] == "open"
        ]
        eligible_students = [
            student
            for student in open_students
            if election_ballot_ready(student.election)
            and student_can_vote_now(student, student.election, now)
        ]

        if len(eligible_students) == 1:
            student = eligible_students[0]
            active_election = student.election
        elif len(eligible_students) > 1:
            return Response(
                {
                    "detail": (
                        "Student is eligible to vote in multiple elections. "
                        "Please contact an administrator."
                    )
                },
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
                    "LOGIN_DENIED_VOTED: student_id=%s, ip=%s",
                    student_id,
                    client_ip,
                )
                return Response(
                    {"detail": "Student has already voted."},
                    status=status.HTTP_409_CONFLICT,
                )

            if not open_student.voting_pin_hash or not open_student.voting_pin_created_at:
                deactivate_expired_voter(open_student)
                return Response(
                    {
                        "detail": (
                            "This voter does not have a valid PIN. "
                            "Please ask an election official to activate you again."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            if voter_access_expired(open_student.voting_pin_created_at, now):
                deactivate_expired_voter(open_student)
                return Response(
                    {
                        "detail": (
                            "This voter PIN has expired. "
                            "Please ask an election official to activate you again."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            self.security_logger.warning(
                "LOGIN_DENIED_INACTIVE: student_id=%s, ip=%s",
                student_id,
                client_ip,
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

        if not isinstance(pin, str) or len(pin) != 8 or not pin.isdigit():
            return Response(
                {"detail": "An 8-digit voter PIN is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            student = (
                Student.objects.select_for_update()
                .select_related("election")
                .get(pk=student.pk)
            )
            active_election = student.election

            if not student_can_vote_now(student, active_election, now):
                return Response(
                    {"detail": "Student is no longer activated to vote."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if not student.voting_pin_hash or not student.voting_pin_created_at:
                deactivate_expired_voter(student)
                return Response(
                    {
                        "detail": (
                            "This voter does not have a valid PIN. "
                            "Please ask an election official to activate you again."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            if voter_access_expired(student.voting_pin_created_at, now):
                deactivate_expired_voter(student)
                return Response(
                    {
                        "detail": (
                            "This voter PIN has expired. "
                            "Please ask an election official to activate you again."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            if student.voting_pin_attempts >= VOTER_PIN_MAX_ATTEMPTS:
                deactivate_expired_voter(student)
                return Response(
                    {
                        "detail": (
                            "Too many invalid PIN attempts. "
                            "Please ask an election official to activate you again."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            if not verify_voter_pin(pin, student.voting_pin_hash):
                student.voting_pin_attempts += 1
                attempts_exhausted = (
                    student.voting_pin_attempts >= VOTER_PIN_MAX_ATTEMPTS
                )
                if attempts_exhausted:
                    student.is_active = False
                    student.voting_pin_hash = ""
                    student.voting_pin_created_at = None
                    student.voting_pin_attempts = 0
                    student.voter_session_expires_at = None
                    detail = (
                        "Too many invalid PIN attempts. "
                        "Please ask an election official to activate you again."
                    )
                else:
                    detail = "Invalid voter PIN."

                student.save(
                    update_fields=[
                        "is_active",
                        "voting_pin_hash",
                        "voting_pin_created_at",
                        "voting_pin_attempts",
                        "voter_session_expires_at",
                    ]
                )
                self.security_logger.warning(
                    "LOGIN_DENIED_PIN: student_id=%s, election_id=%s, ip=%s",
                    student_id,
                    active_election.id,
                    client_ip,
                )
                return Response({"detail": detail}, status=status.HTTP_403_FORBIDDEN)

            student.voting_pin_hash = ""
            student.voting_pin_created_at = None
            student.voting_pin_attempts = 0
            student.voter_session_expires_at = voter_session_expiry(
                active_election, timezone.now()
            )
            student.save(
                update_fields=[
                    "voting_pin_hash",
                    "voting_pin_created_at",
                    "voting_pin_attempts",
                    "voter_session_expires_at",
                ]
            )

        token = create_voter_token(f"{student.student_id}_{active_election.id}")
        self.security_logger.info(
            "LOGIN_SUCCESS: student_id=%s, election_id=%s, ip=%s",
            student.student_id,
            active_election.id,
            client_ip,
        )

        election_lifecycle_data = election_lifecycle(
            active_election,
            timezone.now(),
            include_candidate_lock=False,
        )
        return Response(
            {
                "token": token,
                "can_vote_now": student_can_vote_now(
                    student, active_election, timezone.now()
                ),
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
                },
            },
            status=status.HTTP_200_OK,
        )
