import logging

from django.contrib.auth import get_user_model

from .models import AuditLog


audit_logger = logging.getLogger("security")
AdminUser = get_user_model()


def _student_reference(student_id):
    if not student_id:
        return ""
    value = str(student_id)
    return value if len(value) <= 4 else f"***{value[-4:]}"


def record_audit_event(
    *,
    action,
    outcome=AuditLog.Outcome.INFO,
    request=None,
    election=None,
    student=None,
    actor=None,
    student_id=None,
    metadata=None,
):
    """Persist a safe, structured event without interrupting the request."""
    try:
        request_ip = request.META.get("REMOTE_ADDR") if request else None
        resolved_student_id = student_id or getattr(student, "student_id", "")
        resolved_actor = (
            actor
            if isinstance(actor, AdminUser) and getattr(actor, "is_authenticated", False)
            else None
        )
        AuditLog.objects.create(
            action=action,
            outcome=outcome,
            election=election or getattr(student, "election", None),
            student=student,
            actor=resolved_actor,
            student_reference=_student_reference(resolved_student_id),
            actor_reference=getattr(resolved_actor, "username", ""),
            ip_address=request_ip,
            metadata=metadata or {},
        )
    except Exception:
        audit_logger.exception("AUDIT_RECORD_FAILED: action=%s", action)
