from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    ElectionViewSet,
    StudentViewSet,
    PositionViewSet,
    CandidateViewSet,
    MultiVoteView,
    StudentActivationView,
    BulkStudentUploadView,
    MeView,
    PositionCreateView,
)

router = DefaultRouter()
router.register(r"elections", ElectionViewSet, basename="election")
router.register(r"students", StudentViewSet, basename="student")
router.register(r"positions", PositionViewSet, basename="position")
router.register(r"candidates", CandidateViewSet, basename="candidate")

urlpatterns = [
    # Public, read-only endpoints
    path("", include(router.urls)),

    # Protected voting endpoint for students (HMAC + header auth)
    path("vote/", MultiVoteView.as_view(), name="multi-vote"),

    # Protected activation endpoint for staff activators
    path(
        "students/activate/",
        StudentActivationView.as_view(),
        name="student-activate",
    ),
    path('auth/me/', MeView.as_view(), name='me'),

    # Bulk import students via Excel (staff/superuser)
    path(
        "students/bulk-upload/",
        BulkStudentUploadView.as_view(),
        name="student-bulk-upload",
    ),
    path(
        "positions/create/",
        PositionCreateView.as_view(),
        name="position-create",
    ),
]
