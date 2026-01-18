from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ElectionViewSet, PositionViewSet, CandidateViewSet, MultiVoteView

router = DefaultRouter()
router.register(r"elections", ElectionViewSet, basename="election")
router.register(r"positions", PositionViewSet, basename="position")
router.register(r"candidates", CandidateViewSet, basename="candidate")

urlpatterns = [
    path("", include(router.urls)),
    path("vote/", MultiVoteView.as_view(), name="multi-vote"),

]
