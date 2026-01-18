from rest_framework import serializers

from .models import Election, Position, Candidate, Vote


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


class VoteSerializer(serializers.ModelSerializer):
    voter_hash = serializers.CharField(write_only=True)

    class Meta:
        model = Vote
        fields = ["id", "election", "position", "candidate", "voter_hash", "created_at"]
        read_only_fields = ["created_at"]

        def validate(self, data):
            student_hash = data.get("voter_hash")
            election = data.get("election")
            position = data.get("position")

            # Prevent double voting for same election & position
            if Vote.objects.filter(voter_hash=student_hash, election=election, position=position).exists():
                raise serializers.ValidationError("You have already voted for this position.")

            return data
