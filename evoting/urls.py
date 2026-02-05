
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
    try:
        # Very simple, fast response - no database calls, no complex logic
        from django.http import JsonResponse
        from django.utils.timezone import now
        
        response = JsonResponse({
            "status": "ok",
            "service": "evoting-api",
            "timestamp": now().isoformat()
        }, status=200)
        
        # Add CORS headers for Railway health check
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response["Access-Control-Allow-Headers"] = "*"
        
        return response
        
    except Exception as e:
        # If anything fails, still return 200
        from django.http import HttpResponse
        return HttpResponse("OK", status=200)

urlpatterns = [
    path('', health_check, name='health_check'),
    path('test/', lambda request: JsonResponse({"message": "Django is working!"}), name='test'),
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

