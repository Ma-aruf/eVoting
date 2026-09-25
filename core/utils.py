import hmac
import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

VOTER_PIN_LENGTH = 8
VOTER_PIN_MAX_ATTEMPTS = 5
VOTER_PIN_TTL = timedelta(minutes=10)
VOTER_SESSION_TTL = timedelta(minutes=20)
VOTER_PIN_HASH_VERSION = "v1"
VOTER_PIN_HASH_SEPARATOR = ":"


def generate_voter_pin() -> str:
    """Create an eight-digit PIN, including possible leading zeroes."""
    return f"{secrets.randbelow(10 ** VOTER_PIN_LENGTH):0{VOTER_PIN_LENGTH}d}"


def _voter_pin_digest(pin: str, salt: str) -> str:
    """Create the keyed digest used to verify a voter PIN."""
    message = (salt + ":" + pin).encode()
    key = settings.SECRET_KEY.encode()
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def hash_voter_pin(pin: str) -> str:
    """Hash a voter PIN before it is stored."""
    salt = secrets.token_hex(16)
    digest = _voter_pin_digest(pin, salt)
    return f"{VOTER_PIN_HASH_VERSION}{VOTER_PIN_HASH_SEPARATOR}{salt}{VOTER_PIN_HASH_SEPARATOR}{digest}"


def verify_voter_pin(pin: str, pin_hash: str) -> bool:
    """Check a voter PIN against its stored hash."""
    if not pin_hash:
        return False

    parts = pin_hash.split(VOTER_PIN_HASH_SEPARATOR)
    if len(parts) != 3 or parts[0] != VOTER_PIN_HASH_VERSION:
        return False

    _, salt, expected_digest = parts
    return hmac.compare_digest(_voter_pin_digest(pin, salt), expected_digest)


def voter_access_expired(created_at, now=None) -> bool:
    """Return whether the one-time PIN window has ended."""
    if created_at is None:
        return False
    current_time = now or timezone.now()
    return current_time >= created_at + VOTER_PIN_TTL


def voter_session_expired(expires_at, now=None) -> bool:
    """Return whether an authenticated voter session has ended."""
    if expires_at is None:
        return True
    current_time = now or timezone.now()
    return current_time >= expires_at


def voter_session_expiry(election, now=None):
    """Return a session expiry capped at the election end time."""
    current_time = now or timezone.now()
    return min(current_time + VOTER_SESSION_TTL, election.end_time)


def student_has_current_voter_access(student, now=None) -> bool:
    """Return whether a voter still has usable activation or session access."""
    if not student.is_active or student.has_voted:
        return False

    if student.voter_session_expires_at is not None:
        return not voter_session_expired(student.voter_session_expires_at, now)

    return bool(
        student.voting_pin_created_at
        and not voter_access_expired(student.voting_pin_created_at, now)
    )


def deactivate_expired_voter(student) -> None:
    """Clear expired voter access and deactivate the student."""
    student.is_active = False
    student.voting_pin_hash = ""
    student.voting_pin_created_at = None
    student.voting_pin_attempts = 0
    student.voter_session_expires_at = None
    student.save(
        update_fields=[
            "is_active",
            "voting_pin_hash",
            "voting_pin_created_at",
            "voting_pin_attempts",
            "voter_session_expires_at",
        ]
    )


def deactivate_expired_voter_session(student) -> None:
    """End an expired authenticated voter session."""
    deactivate_expired_voter(student)


def deactivate_expired_voters(now=None) -> int:
    """Deactivate voters whose PIN or authenticated session has ended."""
    from .models import Student

    current_time = now or timezone.now()
    pin_expired = Q(
        voting_pin_created_at__isnull=False,
        voting_pin_created_at__lte=current_time - VOTER_PIN_TTL,
    )
    session_expired = Q(
        voter_session_expires_at__isnull=False,
        voter_session_expires_at__lte=current_time,
    )
    return Student.objects.filter(
        is_active=True,
        has_voted=False,
    ).filter(pin_expired | session_expired).update(
        is_active=False,
        voting_pin_hash="",
        voting_pin_created_at=None,
        voting_pin_attempts=0,
        voter_session_expires_at=None,
    )


def create_voter_token(student_id: str) -> str:
    """Create the election-scoped token used to authenticate a voter."""
    key = settings.VOTER_HMAC_KEY.encode()
    return hmac.new(key, student_id.encode(), hashlib.sha256).hexdigest()


def verify_voter_token(student_id: str, token: str) -> bool:
    """Verify an election-scoped voter token."""
    expected_token = create_voter_token(student_id)
    return hmac.compare_digest(expected_token, token)


def election_has_votes(election_id) -> bool:
    """Return whether the election has any stored historical votes."""
    from .models import Vote

    return Vote.objects.filter(election_id=election_id).exists()
