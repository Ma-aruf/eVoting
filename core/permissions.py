from rest_framework.permissions import SAFE_METHODS, BasePermission


class HasRole(BasePermission):
    allowed_roles: list[str] = []

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        role_is_superuser = getattr(user, 'role', None) == 'superuser'
        django_superuser = bool(getattr(user, 'is_superuser', False))

        if role_is_superuser != django_superuser:
            return False

        return user.role in self.allowed_roles


class IsManagementUser(HasRole):
    """Allow authenticated accounts that can view scoped election data."""

    allowed_roles = ['staff', 'activator', 'superuser']


class IsElectionDataViewer(BasePermission):
    """Allow management accounts and authenticated voters to read ballot data."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if getattr(user, 'student', None) is not None:
            return True

        role = getattr(user, 'role', None)
        role_is_superuser = role == 'superuser'
        django_superuser = bool(getattr(user, 'is_superuser', False))

        if role_is_superuser != django_superuser:
            return False

        return role in {'staff', 'activator', 'superuser'}


class IsSuperUser(HasRole):
    allowed_roles = ['superuser']


class IsStaffOrSuperUser(HasRole):
    allowed_roles = ['staff', 'superuser']


class IsActivatorOrSuperUser(HasRole):
    allowed_roles = ['activator', 'superuser']


class CanActivateVoters(HasRole):
    allowed_roles = ['staff', 'activator', 'superuser']


class CanAccessStudents(BasePermission):
    """Allow staff to manage students and activators to read them."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        role = getattr(user, 'role', None)
        role_is_superuser = role == 'superuser'
        django_superuser = bool(getattr(user, 'is_superuser', False))

        if role_is_superuser != django_superuser:
            return False

        if role in {'staff', 'superuser'}:
            return True

        return role == 'activator' and request.method in SAFE_METHODS
