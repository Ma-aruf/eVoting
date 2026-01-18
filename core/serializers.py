from rest_framework import serializers
from .models import Election, Position, Candidate, Vote, Student


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
    Serializer for submitting all votes at once.
    Expects:
    {
        "voter_hash": "STUDENT_ID",
        "votes": [
            {"election": 1, "position": 1, "candidate": 5},
            {"election": 1, "position": 2, "candidate": 8},
            ...
        ]
    }
    """
    voter_hash = serializers.CharField()
    votes = serializers.ListField(
        child=serializers.DictField(
            child=serializers.IntegerField()
        )
    )

    def validate(self, data):
        voter_hash = data["voter_hash"]
        votes_list = data["votes"]

        # Validate student exists
        try:
            student = Student.objects.get(student_id=voter_hash)
        except Student.DoesNotExist:
            raise serializers.ValidationError({"voter_hash": "Invalid student ID."})

        if not student.is_active:
            raise serializers.ValidationError({"voter_hash": "Student not activated to vote."})

        # Check for duplicate positions
        positions = [v["position"] for v in votes_list]
        if len(positions) != len(set(positions)):
            raise serializers.ValidationError("Duplicate positions in submission.")

        # Check if student already voted for any positions
        election_ids = [v["election"] for v in votes_list]
        existing = Vote.objects.filter(
            voter_hash=voter_hash,
            position_id__in=positions,
            election_id__in=election_ids
        )
        if existing.exists():
            raise serializers.ValidationError("You have already voted for some positions.")

        return data
