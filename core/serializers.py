from rest_framework import serializers
from .models import Election, Position, Candidate, Vote, Student, User
from .utils import election_has_votes, ELECTION_CONFIGURATION_LOCKED_DETAIL


class AssignedElectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Election
        fields = ["id", "name", "year"]


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
    class Meta:
        model = Election
        fields = '__all__'

    def validate(self, data):
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
                    "detail": ELECTION_CONFIGURATION_LOCKED_DETAIL
                })
        return data


class PositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Position
        fields = "__all__"


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
    votes = serializers.ListField(
        child=serializers.DictField(child=serializers.IntegerField()),
        allow_empty=True
    )

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

        # Basic shape checks for election/candidate presence
        for v in votes_list:
            if v.get("election") is None or v.get("candidate") is None:
                raise serializers.ValidationError("Each vote must include 'election' and 'candidate' ids.")

        return data
