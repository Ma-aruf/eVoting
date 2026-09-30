from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .election_access import get_scoped_election_or_404, scope_queryset
from .election_lifecycle import (
    VOTING_MODE_YES_NO,
    election_lifecycle,
    position_voting_mode,
)
from .models import AuditLog, Candidate, Election, Position, Student, Vote, VoterSMSAttempt
from .permissions import IsStaffOrSuperUser
from .utils import VOTER_PIN_TTL, VOTER_SMS_PIN_TTL


RESULTS_UNAVAILABLE_DETAIL = "Live results are available after voting starts. Scheduled elections do not have live results yet."


def results_are_available(election):
    return election_lifecycle(
        election, include_candidate_lock=False
    )["status"] in {"open", "paused", "ended"}


class ElectionOperationsView(APIView):
    """Current election operations, scoped to the requesting management user."""

    permission_classes = [IsStaffOrSuperUser]

    def get(self, request):
        now = timezone.now()
        elections = [
            election for election in scope_queryset(
                Election.objects.all(), request.user, "id"
            ).order_by("-year", "name", "id")
            if election_lifecycle(election, now, include_candidate_lock=False)["status"]
            in {"open", "paused"}
        ]
        election_ids = [election.id for election in elections]

        valid_access = (
            Q(voter_session_expires_at__gt=now)
            | Q(voter_session_expires_at__isnull=True, voter_activation_expires_at__gt=now)
            | Q(
                voter_session_expires_at__isnull=True,
                voter_activation_expires_at__isnull=True,
                election__voter_login_mode=Election.VOTER_LOGIN_MODE_PIN,
                voting_pin_created_at__gt=now - VOTER_PIN_TTL,
            )
            | Q(
                voter_session_expires_at__isnull=True,
                voter_activation_expires_at__isnull=True,
                election__voter_login_mode=Election.VOTER_LOGIN_MODE_SMS,
                voting_pin_created_at__gt=now - VOTER_SMS_PIN_TTL,
            )
        )
        available = Q(is_active=True, has_voted=False)
        voter_counts = {
            row["election_id"]: row
            for row in Student.objects.filter(election_id__in=election_ids)
            .values("election_id")
            .annotate(
                total_voters=Count("id"),
                active_voters=Count("id", filter=available & valid_access),
                logged_in_voters=Count(
                    "id", filter=available & Q(voter_session_expires_at__gt=now)
                ),
                voters_voted=Count("id", filter=Q(has_voted=True)),
            )
        }
        audit_counts = {
            row["election_id"]: row
            for row in AuditLog.objects.filter(election_id__in=election_ids)
            .values("election_id")
            .annotate(
                failed_logins=Count("id", filter=Q(action="VOTER_LOGIN_FAILED")),
                expired_sessions=Count(
                    "id",
                    filter=Q(action="VOTER_AUTH_FAILED", metadata__reason="session_expired"),
                ),
            )
        }
        sms_counts = {
            row["election_id"]: row
            for row in VoterSMSAttempt.objects.filter(election_id__in=election_ids)
            .values("election_id")
            .annotate(
                sms_sent=Count("id", filter=Q(status=VoterSMSAttempt.Status.SENT)),
                sms_failed=Count(
                    "id", filter=Q(status__in=[
                        VoterSMSAttempt.Status.FAILED,
                        VoterSMSAttempt.Status.DISABLED,
                    ])
                ),
                sms_generated=Count("id", filter=Q(status=VoterSMSAttempt.Status.GENERATED)),
            )
        }

        fields = (
            "total_voters", "active_voters", "logged_in_voters", "voters_voted",
            "yet_to_activate", "failed_logins", "expired_sessions",
            "sms_sent", "sms_failed", "sms_generated",
        )
        totals = {field: 0 for field in fields}
        rows = []
        for election in elections:
            voters = voter_counts.get(election.id, {})
            audits = audit_counts.get(election.id, {})
            sms = sms_counts.get(election.id, {})
            total_voters = voters.get("total_voters", 0)
            active_voters = voters.get("active_voters", 0)
            row = {
                "id": election.id,
                "name": election.name,
                "year": election.year,
                "status": election_lifecycle(
                    election, now, include_candidate_lock=False
                )["status"],
                "voter_login_mode": election.voter_login_mode,
                "start_time": election.start_time,
                "end_time": election.end_time,
                "total_voters": total_voters,
                "active_voters": active_voters,
                "logged_in_voters": voters.get("logged_in_voters", 0),
                "voters_voted": voters.get("voters_voted", 0),
                "yet_to_activate": max(0, total_voters - active_voters - voters.get("voters_voted", 0)),
                "failed_logins": audits.get("failed_logins", 0),
                "expired_sessions": audits.get("expired_sessions", 0),
                "sms_sent": sms.get("sms_sent", 0),
                "sms_failed": sms.get("sms_failed", 0),
                "sms_generated": sms.get("sms_generated", 0),
                "turnout_percentage": round(
                    voters.get("voters_voted", 0) / total_voters * 100, 1
                ) if total_voters else 0,
            }
            for field in fields:
                totals[field] += row[field]
            rows.append(row)

        totals["turnout_percentage"] = round(
            totals["voters_voted"] / totals["total_voters"] * 100, 1
        ) if totals["total_voters"] else 0
        return Response({"totals": totals, "elections": rows})

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
        if not results_are_available(election):
            return Response(
                {"detail": RESULTS_UNAVAILABLE_DETAIL},
                status=status.HTTP_403_FORBIDDEN,
            )

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

        if not results_are_available(election):
            return Response(
                {"detail": RESULTS_UNAVAILABLE_DETAIL},
                status=status.HTTP_403_FORBIDDEN,
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

        if not results_are_available(position.election):
            return Response(
                {"detail": RESULTS_UNAVAILABLE_DETAIL},
                status=status.HTTP_403_FORBIDDEN,
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


