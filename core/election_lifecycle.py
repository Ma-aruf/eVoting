"""Central rules for election availability and ballot-change locking."""

from django.utils import timezone
from django.db.models import Exists, OuterRef

from .models import Candidate, Position
from .utils import election_has_votes, student_has_current_voter_access


BALLOT_LOCKED_AFTER_START = (
    "Candidate and ballot changes are no longer allowed because the election has started."
)
BALLOT_LOCKED_AFTER_VOTES = (
    "Candidate and ballot changes are locked because votes have already been cast."
)
START_TIME_LOCKED_DETAIL = (
    "The scheduled start time cannot be moved after the election has started."
)

VOTING_MODE_CANDIDATE = "candidate"
VOTING_MODE_YES_NO = "yes_no"


def election_status(election, now=None):
    """Return scheduled, open, paused, or ended for one aware point in time."""
    now = now or timezone.now()
    if now < election.start_time:
        return "scheduled"
    if now >= election.end_time:
        return "ended"
    return "open" if election.voting_enabled else "paused"


def election_lifecycle(election, now=None, *, include_candidate_lock=True):
    """Return a consistent status snapshot for API serialization."""
    now = now or timezone.now()
    status = election_status(election, now)
    result = {
        "status": status,
        "voting_open": status == "open",
    }
    if include_candidate_lock:
        result["candidate_changes_locked"] = candidate_changes_locked(
            election, now
        )
    return result


def election_ballot_ready(election):
    """A ballot needs at least one position and a valid candidate per position."""
    positions = Position.objects.filter(election_id=election.pk).annotate(
        has_candidate=Exists(
            Candidate.objects.filter(
                position_id=OuterRef("pk"),
                student__election_id=election.pk,
            )
        )
    )
    return positions.exists() and not positions.filter(has_candidate=False).exists()


def position_voting_mode(position):
    """A locked single-candidate position uses an approval choice."""
    if Candidate.objects.filter(position_id=position.pk).count() == 1:
        return VOTING_MODE_YES_NO
    return VOTING_MODE_CANDIDATE


def candidate_changes_locked(election, now=None):
    """Ballot data freezes at scheduled opening, or earlier if votes exist."""
    now = now or timezone.now()
    return now >= election.start_time or election_has_votes(election.pk)


def ballot_change_lock_detail(election, now=None):
    """Return the user-facing lock reason, or None while changes are allowed."""
    now = now or timezone.now()
    if election_has_votes(election.pk):
        return BALLOT_LOCKED_AFTER_VOTES
    if now >= election.start_time:
        return BALLOT_LOCKED_AFTER_START
    return None


def student_can_vote_now(student, election, now=None):
    """Check student activation and ballot state against the election window."""
    now = now or timezone.now()
    return (
        student.election_id == election.pk
        and election_lifecycle(
            election, now, include_candidate_lock=False
        )["voting_open"]
        and student_has_current_voter_access(student, now)
    )
