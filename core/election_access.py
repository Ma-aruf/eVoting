"""Helpers for enforcing election-scoped access in API views."""

from django.http import Http404

from .models import Election


NO_ELECTION_SCOPE = object()


def is_consistent_superuser(user):
    """Return whether *user* is the configured, internally consistent superuser."""
    return bool(
        getattr(user, "is_authenticated", False)
        and getattr(user, "role", None) == "superuser"
        and getattr(user, "is_superuser", False)
    )


def get_election_scope(user):
    """
    Return the election ID visible to a request.

    ``None`` means every election (a superuser), while ``NO_ELECTION_SCOPE``
    means the authenticated principal has no election data scope.
    """
    if is_consistent_superuser(user):
        return None

    student = getattr(user, "student", None)
    if student is not None:
        return student.election_id

    if (
        getattr(user, "is_authenticated", False)
        and getattr(user, "role", None) in {"staff", "activator"}
        and getattr(user, "assigned_election_id", None) is not None
    ):
        return user.assigned_election_id

    return NO_ELECTION_SCOPE


def scope_queryset(queryset, user, election_field="election_id"):
    """Limit a queryset to the caller's election without exposing other IDs."""
    scope = get_election_scope(user)
    if scope is None:
        return queryset
    if scope is NO_ELECTION_SCOPE:
        return queryset.none()
    return queryset.filter(**{election_field: scope})


def get_scoped_election_or_404(user, election_id):
    """Fetch an election only when it belongs to the caller's permitted scope."""
    scope = get_election_scope(user)
    if scope is NO_ELECTION_SCOPE:
        raise Http404("Election not found.")
    if scope is not None and str(scope) != str(election_id):
        raise Http404("Election not found.")
    return Election.objects.get(pk=election_id)

