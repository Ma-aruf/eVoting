from rest_framework import serializers
from .models import Election, Position, Candidate, Vote, Student, User


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, min_length=6)

    class Meta:
        model = User
        fields = ["id", "username", "role", "is_active", "password"]
        read_only_fields = ["id"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
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


class PositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Position
        fields = "__all__"


class CandidateSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)

    class Meta:
        model = Candidate
        fields = ["id", "student", "student_name", "position", "photo_url"]


class MultiVoteSerializer(serializers.Serializer):
    """
    Only validate the votes payload. Student identity and token are
    authenticated at the view layer (headers).
    """
    votes = serializers.ListField(
        child=serializers.DictField(child=serializers.IntegerField()),
        allow_empty=False
    )

    def validate(self, data):
        votes_list = data["votes"]

        # Check duplicate positions in submission
        positions = [v.get("position") for v in votes_list]
        if None in positions:
            raise serializers.ValidationError("Each vote must include a 'position' id.")
        if len(positions) != len(set(positions)):
            raise serializers.ValidationError("Duplicate positions in submission.")

        # Basic shape checks for election/candidate presence
        for v in votes_list:
            if v.get("election") is None or v.get("candidate") is None:
                raise serializers.ValidationError("Each vote must include 'election' and 'candidate' ids.")

        return data