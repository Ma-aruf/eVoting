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
    ElectionCreateView,
    CandidateCreateView,
    ElectionManageView,
    StudentVoterLoginView,
    ElectionStatsView,
    PositionStatsView,
    ElectionResultsView,
    CandidatesForPositionView,
    UserViewSet,
)

router = DefaultRouter()
router.register(r"elections", ElectionViewSet, basename="election")
router.register(r"students", StudentViewSet, basename="student")
router.register(r"positions", PositionViewSet, basename="position")
router.register(r"candidates", CandidateViewSet, basename="candidate")
router.register(r"users", UserViewSet, basename="user")




urlpatterns = [
    # Voter authentication
    path("voter/login/", StudentVoterLoginView.as_view(), name="voter-login"),

    # Voting endpoint
    path("vote/", MultiVoteView.as_view(), name="multi-vote"),

    # Student activation (for activators/staff)
    path("students/activate/", StudentActivationView.as_view(), name="student-activate"),

    # Auth / user info
    path("auth/me/", MeView.as_view(), name="me"),

    # Bulk operations
    path("students/bulk-upload/", BulkStudentUploadView.as_view(), name="student-bulk-upload"),

    # Create endpoints
    path("positions/create/", PositionCreateView.as_view(), name="position-create"),
    path("positions/<int:pk>/", PositionCreateView.as_view()),  # PUT, DELETE
    path("candidates/create/", CandidateCreateView.as_view(), name="candidate-create"),
    path("candidates/<int:pk>/", CandidateCreateView.as_view()),  # PUT, DELETE
    path("elections/create/", ElectionCreateView.as_view(), name="election-create"),

    # Election management
    path("elections/manage/", ElectionManageView.as_view(), name="election-manage"),

    # Stats & results endpoints
    path("elections/<int:election_id>/stats/", ElectionStatsView.as_view(), name="election-stats"),
    path("votes/position-stats/", PositionStatsView.as_view(), name="position-stats"),
    path("elections/<int:election_id>/results/", ElectionResultsView.as_view(), name="election-results"),
    path('candidates-for-position/', CandidatesForPositionView.as_view(), name='candidates-for-position'),

    # Public read-only viewsets (must come last)
    path("", include(router.urls)),
]
