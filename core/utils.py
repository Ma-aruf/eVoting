import hmac
import hashlib
from django.conf import settings



def make_voter_hmac(student_id: str) -> str:
    """
    Return hex HMAC-SHA256 of student_id using settings.VOTER_HMAC_KEY.
    """
    key = settings.VOTER_HMAC_KEY.encode()
    return hmac.new(key, student_id.encode(), hashlib.sha256).hexdigest()








def generate_voter_hmac(student_id: str) -> str:
    """
    Generate HMAC token for student voting.
    Uses SECRET_KEY as the key.
    """
    secret_key = settings.VOTER_HMAC_KEY.encode()
    message = student_id.encode()

    hmac_obj = hmac.new(secret_key, message, hashlib.sha256)
    return hmac_obj.hexdigest()


# The verify_voter_hmac should already exist, but here's what it should look like:
def verify_voter_hmac(student_id: str, token: str) -> bool:
    """
    Verify HMAC token for student voting.
    """
    expected_token = generate_voter_hmac(student_id)
    return hmac.compare_digest(expected_token, token)

