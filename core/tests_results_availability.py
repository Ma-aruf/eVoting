from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Candidate, Election, Position, Student, User
from .result_views import RESULTS_UNAVAILABLE_DETAIL


class ResultsAvailabilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_superuser(
            username="results-admin", password="password123"
        ))
        now = timezone.now()
        schedules = {
            "scheduled": (now + timedelta(hours=1), now + timedelta(hours=2), True),
            "open": (now - timedelta(hours=1), now + timedelta(hours=1), True),
            "paused": (now - timedelta(hours=1), now + timedelta(hours=1), False),
            "ended": (now - timedelta(hours=2), now - timedelta(hours=1), True),
        }
        self.records = {}
        for name, (start_time, end_time, voting_enabled) in schedules.items():
            election = Election.objects.create(
                name=name, year=2026, start_time=start_time,
                end_time=end_time, voting_enabled=voting_enabled,
            )
            position = Position.objects.create(
                name="President", election=election, display_order=1
            )
            student = Student.objects.create(
                student_id=f"C-{name}", full_name=f"Candidate {name}",
                class_name="A", election=election,
            )
            Candidate.objects.create(
                student=student, position=position, ballot_number=1
            )
            self.records[name] = (election, position)

    def test_vote_count_endpoints_require_voting_to_have_started(self):
        for state, (election, position) in self.records.items():
            with self.subTest(state=state):
                responses = (
                    self.client.get(f"/api/elections/{election.id}/results/"),
                    self.client.get(
                        "/api/votes/position-stats/",
                        {"position_id": position.id},
                    ),
                    self.client.get(
                        "/api/candidates-for-position/",
                        {"position_id": position.id},
                    ),
                )
                expected = 403 if state == "scheduled" else 200
                for response in responses:
                    self.assertEqual(response.status_code, expected)
                    if expected == 403:
                        self.assertEqual(
                            response.data["detail"], RESULTS_UNAVAILABLE_DETAIL
                        )
