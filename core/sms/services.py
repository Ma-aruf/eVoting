from dataclasses import dataclass
import json
import re

from django.conf import settings
from django.utils.html import strip_tags


@dataclass(frozen=True)
class SMSResult:
    success: bool
    provider: str
    message_id: str | None = None
    error_category: str | None = None
    http_status: int | None = None
    provider_error_code: str | None = None
    provider_message: str | None = None


class SMSHTTPClient:
    """Safe response/error helpers shared by SMS provider clients."""

    max_provider_message_length = 160

    @classmethod
    def _safe_provider_text(cls, value, *, sensitive_values=(), limit=None):
        if not isinstance(value, (str, int, float)) or isinstance(value, bool):
            return None
        text = " ".join(strip_tags(str(value)).split())
        for sensitive in sensitive_values:
            if sensitive:
                text = re.sub(re.escape(str(sensitive)), "[redacted]", text, flags=re.I)
        text = re.sub(r"\+?233[\d().-]{9,}", "[redacted phone]", text)
        text = re.sub(r"0[235][\d().-]{8,}", "[redacted phone]", text)
        return text[: limit or cls.max_provider_message_length].strip() or None

    @classmethod
    def _safe_error_details(cls, payload, *, sensitive_values):
        if not isinstance(payload, dict):
            return None, None

        containers = [payload]
        for key in ("error", "errors", "data"):
            value = payload.get(key)
            if isinstance(value, dict):
                containers.append(value)

        error_code = None
        for container in containers:
            for key in ("error_code", "code"):
                value = cls._safe_provider_text(
                    container.get(key),
                    sensitive_values=sensitive_values,
                    limit=64,
                )
                if value and re.fullmatch(r"[A-Za-z0-9_.:-]{1,64}", value):
                    error_code = value
                    break
            if error_code:
                break

        provider_message = None
        for container in containers:
            for key in ("message", "detail", "description", "error"):
                provider_message = cls._safe_provider_text(
                    container.get(key),
                    sensitive_values=sensitive_values,
                )
                if provider_message:
                    break
            if provider_message:
                break

        return error_code, provider_message

    @staticmethod
    def _read_json(response):
        return json.loads(response.read(8192).decode("utf-8"))


def send_sms(*, recipient, message, provider=None):
    provider_name = (settings.SMS_PROVIDER or "mnotify").strip().lower()
    if not settings.SMS_ENABLED:
        return SMSResult(
            success=False,
            provider=provider_name,
            error_category="disabled",
        )

    if provider is None:
        if provider_name != "mnotify":
            return SMSResult(
                success=False,
                provider=provider_name,
                error_category="unsupported_provider",
            )
        from .mnotify import MNotifySMSClient

        provider = MNotifySMSClient()

    return provider.send(recipient=recipient, message=message)


def get_sms_configuration_error():
    if not settings.SMS_ENABLED:
        return "disabled"
    if (settings.SMS_PROVIDER or "").strip().lower() != "mnotify":
        return "unsupported_provider"
    from .mnotify import MNotifySMSClient

    return MNotifySMSClient().validate_configuration()
