from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import Election, Student, User


class ActivationOptionsTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.election = Election.objects.create(
            name="Activation options",
            year=2026,
            start_time=now - timedelta(minutes=1),
            end_time=now + timedelta(hours=1),
            voting_enabled=True,
        )
        self.user = User.objects.create_user(
            username="options-staff",
            password="test-password",
            role="staff",
            assigned_election=self.election,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

        Student.objects.create(
            election=self.election,
            student_id="ACTIVE",
            full_name="Active Voter",
            class_name="A",
            is_active=True,
            voter_session_expires_at=now + timedelta(minutes=5),
        )
        Student.objects.create(
            election=self.election,
            student_id="VOTED",
            full_name="Voted Voter",
            class_name="A",
            has_voted=True,
        )
        for index in range(40):
            Student.objects.create(
                election=self.election,
                student_id=f"ID-{index:03}",
                full_name=f"Available Voter {index:03}",
                class_name="A",
            )

    def test_activation_options_returns_aggregates_and_bounded_search_results(self):
        response = self.client.get(
            "/api/students/activation-options/",
            {"election_id": self.election.pk, "search": "ID-"},
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["summary"], {
            "total": 42,
            "activated": 1,
            "voted": 1,
            "available": 40,
        })
        self.assertEqual(len(response.data["results"]), 25)
        self.assertTrue(all(row["student_id"].startswith("ID-") for row in response.data["results"]))

    def test_activation_options_requires_election_scope(self):
        response = self.client.get("/api/students/activation-options/")
        self.assertEqual(response.status_code, 400)

    def test_selected_voter_display_text_still_resolves_in_search(self):
        response = self.client.get(
            "/api/students/activation-options/",
            {"election_id": self.election.pk, "search": "Available Voter 012 (ID-012)"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["student_id"] for row in response.data["results"]], ["ID-012"])
