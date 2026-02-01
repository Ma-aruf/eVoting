
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.utils.timezone import now
from django.conf import settings
from django.conf.urls.static import static


from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

def health_check(request):
    import sys
    print(f"Health check accessed: {request.method} {request.get_full_path()}", file=sys.stderr)
    print(f"Headers: {dict(request.headers)}", file=sys.stderr)
    print(f"ALLOWED_HOSTS: {getattr(__import__('django.conf').settings, 'ALLOWED_HOSTS', 'Not set')}", file=sys.stderr)
    
    # Simple, fast health check that always returns 200
    # Railway just needs to see the app is running, not database status
    response = JsonResponse({
        "status": "ok",
        "service": "evoting-api",
        "timestamp": now().isoformat(),
    }, status=200)
    
    print(f"Response status: {response.status_code}", file=sys.stderr)
    return response

urlpatterns = [
    path('', health_check, name='health_check'),
    path('test/', lambda request: JsonResponse({"message": "Django is working!"}), name='test'),
    # path('create-superuser/', create_superuser_view, name='create-superuser'),
    path('admin/', admin.site.urls),
    path("api/", include("core.urls")),


]

urlpatterns += [
    path("api/auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

