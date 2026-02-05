
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.utils.timezone import now
from django.conf import settings
from django.conf.urls.static import static
from django.views.decorators.csrf import csrf_exempt



from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

@csrf_exempt
def health_check(request):
    """ health check endpoint that returns 200 OK"""
    return JsonResponse({
        "status": "ok",
        "service": "evoting-api",
        "timestamp": now().isoformat()
    })

urlpatterns = [
    # Simple health check for Railway
    path('', health_check, name='health_check'),
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

