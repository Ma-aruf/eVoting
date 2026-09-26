import json
import socket
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.exceptions import ValidationError

from .services import SMSHTTPClient, SMSResult


def normalize_ghana_phone_number(value):
    """Return a Ghanaian phone number in +233 international format."""
    if not value or not str(value).strip():
        raise ValidationError("A phone number is required.")

    number = str(value).strip()
    for separator in (" ", "-", "(", ")", "."):
        number = number.replace(separator, "")

    if number.startswith("+233"):
        national_number = number[4:]
    elif number.startswith("00233"):
        national_number = number[5:]
    elif number.startswith("233"):
        national_number = number[3:]
    elif number.startswith("0"):
        national_number = number[1:]
    else:
        raise ValidationError(
            "Enter a Ghanaian phone number beginning with 0, 233, +233, or 00233."
        )

    if not national_number.isdigit():
        raise ValidationError("A phone number may contain only digits and common separators.")
    if len(national_number) != 9:
        raise ValidationError(
            "A Ghanaian phone number must contain 9 digits after the country code."
        )
    if national_number[0] not in {"2", "3", "5"}:
        raise ValidationError("Enter a valid Ghanaian phone number.")

    return f"+233{national_number}"


class MNotifySMSClient(SMSHTTPClient):
    """Send voter SMS messages through the mNotify Quick SMS API."""

    provider_name = "mnotify"

    def __init__(self, *, opener=None):
        self.opener = opener or urlopen

    def _result(
        self,
        *,
        success=False,
        message_id=None,
        error_category=None,
        http_status=None,
        provider_error_code=None,
        provider_message=None,
    ):
        return SMSResult(
            success=success,
            provider=self.provider_name,
            message_id=message_id,
            error_category=error_category,
            http_status=http_status,
            provider_error_code=provider_error_code,
            provider_message=provider_message,
        )

    def validate_configuration(self):
        sender = settings.MNOTIFY_SENDER_ID
        timeout = settings.MNOTIFY_TIMEOUT_SECONDS

        if not sender or len(sender) > 11:
            return "invalid_sender_id"
        if (
            not settings.MNOTIFY_BASE_URL
            or not isinstance(timeout, (int, float))
            or timeout <= 0
        ):
            return "invalid_configuration"
        if not settings.MNOTIFY_API_KEY:
            return "missing_api_key"
        return None

    @staticmethod
    def _campaign_id(payload):
        summary = payload.get("summary") if isinstance(payload, dict) else None
        value = summary.get("_id") if isinstance(summary, dict) else None
        if not isinstance(value, str):
            return None

        value = value.strip()
        allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.:-"
        if not value or len(value) > 255 or any(char not in allowed for char in value):
            return None
        return value

    def send(self, *, recipient, message):
        try:
            normalized_recipient = normalize_ghana_phone_number(recipient)
        except ValidationError:
            return self._result(error_category="invalid_recipient")

        configuration_error = self.validate_configuration()
        if configuration_error:
            return self._result(error_category=configuration_error)

        request_url = (
            f"{settings.MNOTIFY_BASE_URL.rstrip('/')}/api/sms/quick?"
            f"{urlencode({'key': settings.MNOTIFY_API_KEY})}"
        )
        body = json.dumps(
            {
                "recipient": [normalized_recipient],
                "sender": settings.MNOTIFY_SENDER_ID,
                "message": str(message),
                "is_schedule": False,
                "schedule_date": "",
            }
        ).encode("utf-8")
        request = Request(
            request_url,
            data=body,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "EVoting-Backend/1.0",
            },
            method="POST",
        )
        sensitive_values = (
            settings.MNOTIFY_API_KEY,
            normalized_recipient,
            str(message),
        )

        try:
            with self.opener(request, timeout=settings.MNOTIFY_TIMEOUT_SECONDS) as response:
                http_status = getattr(response, "status", None) or 200
                payload = self._read_json(response)
        except HTTPError as error:
            http_status = getattr(error, "code", None)
            try:
                payload = self._read_json(error)
            except (UnicodeDecodeError, json.JSONDecodeError, AttributeError, TypeError):
                payload = None
            error_code, provider_message = self._safe_error_details(
                payload,
                sensitive_values=sensitive_values,
            )
            return self._result(
                error_category="provider_rejected",
                http_status=http_status,
                provider_error_code=error_code,
                provider_message=provider_message,
            )
        except (TimeoutError, socket.timeout):
            return self._result(error_category="timeout")
        except (URLError, ConnectionError, OSError):
            return self._result(error_category="connection_error")
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError, TypeError):
            return self._result(
                error_category="invalid_response",
                http_status=http_status,
            )

        if not isinstance(payload, dict):
            return self._result(
                error_category="invalid_response",
                http_status=http_status,
            )

        if http_status is not None and not 200 <= http_status < 300:
            error_code, provider_message = self._safe_error_details(
                payload,
                sensitive_values=sensitive_values,
            )
            return self._result(
                error_category="provider_rejected",
                http_status=http_status,
                provider_error_code=error_code,
                provider_message=provider_message,
            )

        status = str(payload.get("status", "")).strip().lower()
        summary = payload.get("summary")
        campaign_id = self._campaign_id(payload)
        rejected = (
            summary.get("total_rejected", 0)
            if isinstance(summary, dict)
            else None
        )

        if (
            status == "success"
            and isinstance(summary, dict)
            and campaign_id
            and rejected in (0, 0.0)
        ):
            return self._result(
                success=True,
                message_id=campaign_id,
                http_status=http_status,
            )

        if status in {"error", "failed", "failure"} or payload.get("success") is False:
            error_code, provider_message = self._safe_error_details(
                payload,
                sensitive_values=sensitive_values,
            )
            return self._result(
                error_category="provider_rejected",
                http_status=http_status,
                provider_error_code=error_code,
                provider_message=provider_message,
            )

        return self._result(
            error_category="invalid_response",
            http_status=http_status,
        )
