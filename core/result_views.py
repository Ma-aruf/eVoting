from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .election_access import get_scoped_election_or_404, scope_queryset
from .election_lifecycle import (
    VOTING_MODE_YES_NO,
    election_lifecycle,
    position_voting_mode,
)
from .models import Candidate, Election, Position, Student, Vote
from .permissions import IsStaffOrSuperUser

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

        # Each submitted ballot has one row per position, including skips.
        unique_voters = Vote.objects.filter(election=election).values('voter_hash').distinct().count()

        # Valid choices exclude explicit skips.
        position_votes = Vote.objects.filter(
            election=election,
            position=position
        ).exclude(choice="skip").count()

        skipped = Vote.objects.filter(
            election=election,
            position=position,
            choice="skip",
        ).count()
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

        # Each submitted ballot has one row per position, including skips.
        unique_voters = Vote.objects.filter(election=election).values('voter_hash').distinct().count()
        unique_voters_who_cast_at_least_one_vote = Vote.objects.filter(
            election=election
        ).exclude(choice="skip").values('voter_hash').distinct().count()

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

            skipped = Vote.objects.filter(
                election=election,
                position=position,
                choice="skip",
            ).count()

            # Candidate and skipped percentages share the full ballot total.
            for cand in candidate_results:
                cand["percentage"] = (
                    round((cand["vote_count"] / unique_voters * 100), 2)
                    if unique_voters > 0 else 0.0
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
            "unique_voters_who_cast_at_least_one_vote": unique_voters_who_cast_at_least_one_vote,
            "positions": results,
        })


class CandidatesForPositionView(APIView):
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


