"""
URL configuration for evoting project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse

from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

def health_check(request):
    try:
        # Minimal health check - no Django imports that might fail
        import sys
        return JsonResponse({
            "status": "healthy", 
            "service": "evoting-api",
            "python_version": sys.version,
            "message": "Django app is running"
        })
    except Exception as e:
        return JsonResponse({
            "status": "unhealthy", 
            "service": "evoting-api",
            "error": str(e),
            "type": type(e).__name__
        }, status=500)

urlpatterns = [
    path('', health_check, name='health_check'),
    path('admin/', admin.site.urls),
    path("api/", include("core.urls")),


]

urlpatterns += [
    path("api/auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]

