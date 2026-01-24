
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.utils.timezone import now


from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

def health_check(request):
    response_data = {
        "status": "ok",
        "service": "evoting-api",
        "timestamp": now().isoformat(),
    }

    # Optional: database check (non-fatal)
    try:
        from django.db import connections
        connections["default"].cursor()
        response_data["database"] = "connected"
    except Exception:
        response_data["database"] = "not_ready"

    return JsonResponse(response_data, status=200)

urlpatterns = [
    path('', health_check, name='health_check'),
    # path('create-superuser/', create_superuser_view, name='create-superuser'),
    path('admin/', admin.site.urls),
    path("api/", include("core.urls")),


]

urlpatterns += [
    path("api/auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]

