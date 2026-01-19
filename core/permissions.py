from rest_framework.permissions import BasePermission


class HasRole(BasePermission):
    allowed_roles = []

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user.role in self.allowed_roles


class IsSuperUser(HasRole):
    allowed_roles = ["superuser"]


class IsStaffOrSuperUser(HasRole):
    allowed_roles = ["staff", "superuser"]


class IsActivatorOrSuperUser(HasRole):
    allowed_roles = ["activator", "superuser"]
