from rest_framework import serializers
from django.utils import timezone
from .models import Election, Position, Candidate, Vote, Student, User
from .serializer_helpers import normalize_legacy_election_flag
from .utils import election_has_votes
from .election_lifecycle import (
    election_ballot_ready,
    election_lifecycle,
    position_voting_mode,
    START_TIME_LOCKED_DETAIL,
)


class AssignedElectionSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    voting_open = serializers.SerializerMethodField()
    voting_enabled = serializers.BooleanField(read_only=True)

    class Meta:
        model = Election
        fields = ["id", "name", "year", "voting_enabled", "status", "voting_open"]

    def to_representation(self, instance):
        self._lifecycle_snapshot = election_lifecycle(
            instance, include_candidate_lock=False
        )
        try:
            return super().to_representation(instance)
        finally:
            self._lifecycle_snapshot = None

    def get_status(self, obj):
        return self._lifecycle_snapshot["status"]

    def get_voting_open(self, obj):
        return self._lifecycle_snapshot["voting_open"]


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, min_length=6)
    election_id = serializers.PrimaryKeyRelatedField(
        source="assigned_election",
        queryset=Election.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    assigned_election = AssignedElectionSerializer(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "role",
            "is_active",
            "password",
            "election_id",
            "assigned_election",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        role = attrs.get("role", self.instance.role if self.instance else "staff")
        election_supplied = "election_id" in self.initial_data

        if self.instance:
            if election_supplied:
                raise serializers.ValidationError({
                    "election_id": "Election assignment cannot be changed after account creation."
                })

            if role == "superuser" or self.instance.role == "superuser":
                if role != self.instance.role:
                    raise serializers.ValidationError({
                        "role": "Superuser status cannot be changed through user management."
                    })
            elif self.instance.assigned_election_id is None:
                raise serializers.ValidationError({
                    "assigned_election": "This account must be assigned to an election before it can be edited."
                })
        elif role == "superuser":
            if election_supplied:
                raise serializers.ValidationError({
                    "election_id": "Superusers must not be assigned to an election."
                })
        elif attrs.get("assigned_election") is None:
            raise serializers.ValidationError({
                "election_id": "Staff and activator accounts require an election assignment."
            })

        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        role = validated_data.get("role", "staff")
        validated_data["is_superuser"] = role == "superuser"
        validated_data["is_staff"] = role == "superuser"
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        validated_data.pop("assigned_election", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class StudentSerializer(serializers.ModelSerializer):
    election_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = Student
        fields = ["id", "student_id", "full_name", "class_name", "has_voted", "is_active", "election", "election_id"]
        read_only_fields = ["has_voted", "election"]

    def validate_election_id(self, value):
        """Ensure election exists and is valid."""
        if not Election.objects.filter(id=value).exists():
            raise serializers.ValidationError("Invalid election ID.")
        return value

    def validate(self, attrs):
        if self.instance and "election_id" in self.initial_data:
            raise serializers.ValidationError({
                "election_id": "A student's election cannot be changed after creation."
            })
        return attrs

    def create(self, validated_data):
        """Create student with the specified election."""
        election_id = validated_data.pop('election_id')
        election = Election.objects.get(id=election_id)
        validated_data['election'] = election
        return super().create(validated_data)


class BulkStudentUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    election_id = serializers.IntegerField()


class ElectionSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    voting_open = serializers.SerializerMethodField()
    candidate_changes_locked = serializers.SerializerMethodField()
    ballot_ready = serializers.SerializerMethodField()
    # Temporary deprecated response alias for the separately deployed frontend.
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = Election
        fields = [
            "id", "name", "year", "start_time", "end_time", "voting_enabled",
            "status", "voting_open", "candidate_changes_locked", "ballot_ready",
            "is_active",
        ]

    def to_internal_value(self, data):
        return super().to_internal_value(normalize_legacy_election_flag(data))

    def to_representation(self, instance):
        # Keep the status and availability fields on the same timezone-aware snapshot.
        self._lifecycle_snapshot = election_lifecycle(instance)
        try:
            return super().to_representation(instance)
        finally:
            self._lifecycle_snapshot = None

    def get_status(self, obj):
        return self._lifecycle_snapshot["status"]

    def get_voting_open(self, obj):
        return self._lifecycle_snapshot["voting_open"]

    def get_candidate_changes_locked(self, obj):
        return self._lifecycle_snapshot["candidate_changes_locked"]

    def get_ballot_ready(self, obj):
        return election_ballot_ready(obj)

    def get_is_active(self, obj):
        """Deprecated compatibility alias; remove after the frontend transition."""
        return obj.voting_enabled

    def validate(self, data):
        start_time = data.get(
            "start_time", self.instance.start_time if self.instance else None
        )
        end_time = data.get(
            "end_time", self.instance.end_time if self.instance else None
        )
        if start_time is not None and end_time is not None and end_time <= start_time:
            raise serializers.ValidationError({
                "end_time": "The election must end after its starting time."
            })

        if self.instance is None and data.get("voting_enabled", False):
            raise serializers.ValidationError({
                "voting_enabled": (
                    "Create the election first, then configure positions and candidates "
                    "before enabling voting."
                )
            })

        if self.instance:
            now = timezone.now()
            if (
                "start_time" in data
                and now >= self.instance.start_time
                and data["start_time"] > self.instance.start_time
            ):
                raise serializers.ValidationError({
                    "start_time": START_TIME_LOCKED_DETAIL
                })

        if self.instance and election_has_votes(self.instance.pk):
            protected_fields = {
                "name", "year", "start_time", "end_time"
            }
            changed = [
                field for field in protected_fields
                if field in data and data[field] != getattr(self.instance, field)
            ]
            if changed:
                raise serializers.ValidationError({
                    "detail": "Election settings cannot be changed after voting activity."
                })
        return data


class ElectionToggleSerializer(serializers.Serializer):
    election_id = serializers.IntegerField()
    voting_enabled = serializers.BooleanField(required=False)

    def to_internal_value(self, data):
        normalized = normalize_legacy_election_flag(data)
        if "voting_enabled" not in normalized:
            raise serializers.ValidationError({
                "voting_enabled": "This field is required."
            })
        return super().to_internal_value(normalized)

    def validate(self, attrs):
        new_value = attrs.get("voting_enabled")
        if new_value is None:
            raise serializers.ValidationError({
                "voting_enabled": "This field is required."
            })
        return attrs


class ElectionEndTimeExtensionSerializer(serializers.Serializer):
    end_time = serializers.DateTimeField()
    reason = serializers.CharField(max_length=500, trim_whitespace=True)


class ElectionScheduleUpdateSerializer(serializers.Serializer):
    start_time = serializers.DateTimeField()
    end_time = serializers.DateTimeField()

    def validate(self, attrs):
        if attrs["end_time"] <= attrs["start_time"]:
            raise serializers.ValidationError({
                "end_time": "The election must end after its starting time."
            })
        return attrs


class PositionSerializer(serializers.ModelSerializer):
    voting_mode = serializers.SerializerMethodField()

    class Meta:
        model = Position
        fields = ["id", "name", "election", "display_order", "voting_mode"]

    def get_voting_mode(self, obj):
        return position_voting_mode(obj)


class CandidateSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)

    class Meta:
        model = Candidate
        fields = ["id", "student", "student_name", "position", "photo_url", "ballot_number"]

    def validate(self, data):
        """
        Validate that ballot_number is unique within the same position
        and that student is only a candidate for one position.
        """
        # Get the position and ballot_number from the data
        position = data.get('position')
        ballot_number = data.get('ballot_number')
        student = data.get('student')

        # PATCH requests may omit either relationship; validate the effective pair.
        effective_position = position or getattr(self.instance, 'position', None)
        effective_student = student or getattr(self.instance, 'student', None)

        if effective_position and effective_student:
            if effective_student.election_id != effective_position.election_id:
                raise serializers.ValidationError({
                    'student': 'Candidate student must belong to the same election as the position.'
                })
        
        # Validate student uniqueness (only if student is being changed/added)
        if student:
            # Check if this student is already a candidate for any position
            # Exclude the current instance if we're updating
            queryset = Candidate.objects.filter(student=student)
            
            # If this is an update operation, exclude the current instance
            if self.instance and self.instance.pk:
                queryset = queryset.exclude(pk=self.instance.pk)
            
            if queryset.exists():
                existing_candidate = queryset.first()
                existing_position = existing_candidate.position
                raise serializers.ValidationError({
                    'student': f'This student is already a candidate for position "{existing_position.name}". A student can only run for one position.'
                })
        
        # If both position and ballot_number are provided
        if position and ballot_number is not None:
            # Check if there's an existing candidate with the same position and ballot_number
            # Exclude the current instance if we're updating
            queryset = Candidate.objects.filter(position=position, ballot_number=ballot_number)
            
            # If this is an update operation, exclude the current instance
            if self.instance and self.instance.pk:
                queryset = queryset.exclude(pk=self.instance.pk)
            
            if queryset.exists():
                raise serializers.ValidationError({
                    'ballot_number': f'A candidate with ballot number {ballot_number} already exists for this position.'
                })
        
        return data


class MultiVoteSerializer(serializers.Serializer):
    """
    Only validate the votes payload. Student identity and token are
    authenticated at the view layer (headers).
    """
    class VoteItemSerializer(serializers.Serializer):
        election = serializers.IntegerField()
        position = serializers.IntegerField()
        candidate = serializers.IntegerField(allow_null=True)
        choice = serializers.ChoiceField(
            choices=("candidate", "yes", "no", "skip"), default="candidate"
        )

    votes = serializers.ListField(child=VoteItemSerializer(), allow_empty=True)

    def validate(self, data):
        votes_list = data["votes"]

        if not votes_list:
            raise serializers.ValidationError(
                "A complete ballot must contain exactly one selection for every position."
            )

        # Check duplicate positions in submission
        positions = [v.get("position") for v in votes_list]
        if None in positions:
            raise serializers.ValidationError("Each vote must include a 'position' id.")
        if len(positions) != len(set(positions)):
            raise serializers.ValidationError(
                "A complete ballot must contain exactly one selection for every position."
            )

        return data
