
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.utils.timezone import now


from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

def health_check(request):
    # Simple, fast health check that always returns 200
    # Railway just needs to see the app is running, not database status
    return JsonResponse({
        "status": "ok",
        "service": "evoting-api",
        "timestamp": now().isoformat(),
    }, status=200)

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

