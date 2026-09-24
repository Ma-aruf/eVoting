import hmac
import hashlib
from django.conf import settings


def create_voter_token(student_id: str) -> str:
    """Create the election-scoped token used to authenticate a voter."""
    key = settings.VOTER_HMAC_KEY.encode()
    return hmac.new(key, student_id.encode(), hashlib.sha256).hexdigest()


def verify_voter_token(student_id: str, token: str) -> bool:
    """Verify an election-scoped voter token."""
    expected_token = create_voter_token(student_id)
    return hmac.compare_digest(expected_token, token)


def election_has_votes(election_id) -> bool:
    """Return whether an election has any stored historical votes."""
    from .models import Vote

    return Vote.objects.filter(election_id=election_id).exists()
