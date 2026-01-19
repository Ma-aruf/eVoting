import hmac
import hashlib
from django.conf import settings


def make_voter_hmac(student_id: str) -> str:
    """
    Return hex HMAC-SHA256 of student_id using settings.VOTER_HMAC_KEY.
    """
    key = settings.VOTER_HMAC_KEY.encode()
    return hmac.new(key, student_id.encode(), hashlib.sha256).hexdigest()


def verify_voter_hmac(student_id: str, token: str) -> bool:
    """
    Constant-time compare expected HMAC with provided token.
    """
    expected = make_voter_hmac(student_id)
    return hmac.compare_digest(expected, token)
