import re
import time
import uuid


class RequestCorrelationMiddleware:
    """Attach a safe request identifier and start time to every request."""

    _SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        supplied_id = request.headers.get("X-Request-ID", "")
        request.correlation_id = (
            supplied_id if self._SAFE_ID.fullmatch(supplied_id) else str(uuid.uuid4())
        )
        request.started_at = time.monotonic()
        response = self.get_response(request)
        response["X-Request-ID"] = request.correlation_id
        return response


class HealthCheckSSLRedirectMiddleware:
    """
    Middleware to exclude health check paths from SSL redirect.
    This allows Railway health checks to work over HTTP while 
    keeping SSL redirect enabled for all other requests.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
        
    def __call__(self, request):
        # Exclude health check paths from SSL redirect
        health_check_paths = ['/api/health/', '/health/', '/']
        
        if request.path in health_check_paths:
            # Temporarily disable SSL redirect for health checks
            request._disable_ssl_redirect = True
            
        response = self.get_response(request)
        return response


class CustomSecurityMiddleware:
    """
    Custom security middleware that respects health check exemptions
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
        
    def __call__(self, request):
        from django.middleware.security import SecurityMiddleware
        from django.conf import settings
        
        # Check if SSL redirect should be disabled for this request
        if getattr(request, '_disable_ssl_redirect', False):
            # Temporarily disable SSL redirect
            original_ssl_redirect = getattr(settings, 'SECURE_SSL_REDIRECT', False)
            settings.SECURE_SSL_REDIRECT = False
            
            response = self.get_response(request)
            
            # Restore original setting
            settings.SECURE_SSL_REDIRECT = original_ssl_redirect
            return response
        else:
            return self.get_response(request)
