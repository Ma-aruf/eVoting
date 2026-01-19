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