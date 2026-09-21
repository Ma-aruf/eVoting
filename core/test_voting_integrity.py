from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
import threading
from unittest.mock import patch

from django.db import IntegrityError, connection
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from .models import Candidate, Election, Position, Student, User, Vote
from .serializers import ElectionSerializer
from .utils import generate_voter_hmac
from .views import (
    CandidatesForPositionView,
    ElectionResultsView,
    PositionStatsView,
)


class VotingIntegrityTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.election = Election.objects.create(
            name="Election A",
            year=2026,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
            voting_enabled=True,
        )
        self.other_election = Election.objects.create(
            name="Election B",
            year=2026,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
            voting_enabled=True,
        )
        self.position = Position.objects.create(
            name="President", election=self.election, display_order=1
        )
        self.position_two = Position.objects.create(
            name="Secretary", election=self.election, display_order=2
        )
        self.other_position = Position.objects.create(
            name="President", election=self.other_election, display_order=1
        )
        self.other_position_two = Position.objects.create(
            name="Secretary", election=self.other_election, display_order=2
        )
        self.student = self.make_student("V001", active=True)
        self.other_student = self.make_student("V002", election=self.other_election, active=True)
        self.candidate_student = self.make_student("C001", election=self.election)
        self.candidate_student_two = self.make_student("C002", election=self.election)
        self.other_candidate_student = self.make_student("C003", election=self.other_election)
        self.candidate = Candidate.objects.create(
            student=self.candidate_student, position=self.position, ballot_number=1
        )
        self.candidate_two = Candidate.objects.create(
            student=self.candidate_student_two, position=self.position_two, ballot_number=1
        )
        self.other_candidate = Candidate.objects.create(
            student=self.other_candidate_student, position=self.other_position, ballot_number=1
        )
        self.other_candidate_two = Candidate.objects.create(
            student=self.make_student("C004", election=self.other_election),
            position=self.other_position_two,
            ballot_number=1,
        )
        self.client = APIClient()

    def make_student(self, student_id, election=None, active=False):
        return Student.objects.create(
            student_id=student_id,
            full_name=student_id,
            class_name="A",
            election=election or self.election,
            is_active=active,
        )

    def headers(self, election=None, student=None, token=None):
        election = election or self.election
        student = student or self.student
        return {
            "HTTP_X_STUDENT_ID": student.student_id,
            "HTTP_X_ELECTION_ID": str(election.id),
            "HTTP_X_VOTER_TOKEN": token or generate_voter_hmac(
                f"{student.student_id}_{election.id}"
            ),
        }

    def ballot(self, election=None):
        election = election or self.election
        if election == self.election:
            return {
                "votes": [
                    {"election": election.id, "position": self.position.id, "candidate": self.candidate.id},
                    {"election": election.id, "position": self.position_two.id, "candidate": self.candidate_two.id},
                ]
            }
        return {
            "votes": [
                {"election": election.id, "position": self.other_position.id, "candidate": self.other_candidate.id},
                {"election": election.id, "position": self.other_position_two.id, "candidate": self.other_candidate_two.id},
            ]
        }

    def post(self, payload=None, **headers):
        return self.client.post("/api/vote/", payload or self.ballot(), format="json", **headers)

    def test_successful_complete_ballot_updates_student_only_after_success(self):
        response = self.post(**self.headers())
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(Vote.objects.filter(election=self.election).count(), 2)
        self.student.refresh_from_db()
        self.assertTrue(self.student.has_voted)
        self.assertFalse(self.student.is_active)

    def test_missing_election_header_and_invalid_hmac_are_rejected(self):
        headers = self.headers()
        missing = dict(headers)
        missing.pop("HTTP_X_ELECTION_ID")
        self.assertEqual(self.post(**missing).status_code, 403)
        self.assertEqual(self.post(**{**headers, "HTTP_X_VOTER_TOKEN": "invalid"}).status_code, 403)

    def test_cross_election_payload_is_rejected_as_one_ballot(self):
        payload = self.ballot()
        payload["votes"][0] = {
            "election": self.other_election.id,
            "position": self.position.id,
            "candidate": self.candidate.id,
        }
        response = self.post(payload, **self.headers())
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Vote.objects.count(), 0)

    def test_position_from_another_election_is_rejected(self):
        payload = self.ballot()
        payload["votes"][0] = {
            "election": self.election.id,
            "position": self.other_position.id,
            "candidate": self.other_candidate.id,
        }
        self.assertEqual(self.post(payload, **self.headers()).status_code, 400)
        self.assertEqual(Vote.objects.count(), 0)

    def test_candidate_from_another_position_is_rejected(self):
        payload = self.ballot()
        payload["votes"][0]["candidate"] = self.candidate_two.id
        self.assertEqual(self.post(payload, **self.headers()).status_code, 400)
        self.assertEqual(Vote.objects.count(), 0)

    def test_candidate_student_from_another_election_is_rejected(self):
        mismatched_student = self.make_student(
            "CROSS-ELECTION", election=self.other_election
        )
        invalid = Candidate.objects.create(
            student=mismatched_student, position=self.position, ballot_number=99
        )
        payload = self.ballot()
        payload["votes"][0]["candidate"] = invalid.id
        self.assertEqual(self.post(payload, **self.headers()).status_code, 400)
        self.assertEqual(Vote.objects.count(), 0)

    def test_empty_and_partial_ballots_are_rejected_without_state_change(self):
        for payload in (
            {"votes": []},
            {"votes": [self.ballot()["votes"][0]]},
        ):
            response = self.post(payload, **self.headers())
            self.assertEqual(response.status_code, 400)
            self.assertEqual(Vote.objects.count(), 0)
            self.student.refresh_from_db()
            self.assertFalse(self.student.has_voted)
            self.assertTrue(self.student.is_active)

    def test_duplicate_position_and_multiple_selection_are_rejected(self):
        payload = {"votes": [self.ballot()["votes"][0], {
            "election": self.election.id,
            "position": self.position.id,
            "candidate": self.candidate.id,
        }]}
        response = self.post(payload, **self.headers())
        self.assertEqual(response.status_code, 400)
        self.assertIn("complete ballot", str(response.data).lower())

    def test_already_voted_inactive_and_inactive_election_are_rejected(self):
        self.student.has_voted = True
        self.student.save(update_fields=["has_voted"])
        self.assertEqual(self.post(**self.headers()).status_code, 403)
        self.student.has_voted = False
        self.student.is_active = False
        self.student.save(update_fields=["has_voted", "is_active"])
        self.assertEqual(self.post(**self.headers()).status_code, 403)
        self.student.is_active = True
        self.student.save(update_fields=["is_active"])
        self.election.voting_enabled = False
        self.election.save(update_fields=["voting_enabled"])
        self.assertEqual(self.post(**self.headers()).status_code, 403)

    def test_voting_window_is_enforced(self):
        for start_time, end_time in (
            (timezone.now() + timedelta(hours=1), timezone.now() + timedelta(hours=2)),
            (timezone.now() - timedelta(hours=2), timezone.now() - timedelta(hours=1)),
        ):
            self.election.start_time = start_time
            self.election.end_time = end_time
            self.election.save(update_fields=["start_time", "end_time"])
            self.assertEqual(self.post(**self.headers()).status_code, 403)

    def test_same_student_id_is_scoped_to_election(self):
        same_id = self.make_student("SAME", election=self.election, active=True)
        other = self.make_student("SAME", election=self.other_election, active=False)
        response = self.client.post("/api/voter/login/", {"student_id": "SAME"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["election"]["id"], self.election.id)
        self.assertTrue(response.data["can_vote_now"])
        self.assertEqual(response.data["election"]["status"], "open")
        self.assertTrue(response.data["election"]["voting_open"])
        self.assertNotEqual(same_id.election_id, other.election_id)

    def test_voter_login_keeps_409_for_multiple_eligible_open_elections(self):
        self.make_student("AMBIGUOUS", election=self.election, active=True)
        self.make_student("AMBIGUOUS", election=self.other_election, active=True)
        response = self.client.post(
            "/api/voter/login/", {"student_id": "AMBIGUOUS"}, format="json"
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("multiple elections", response.data["detail"].lower())

    def test_repeated_submission_does_not_create_extra_votes(self):
        headers = self.headers()
        self.assertEqual(self.post(**headers).status_code, 201)
        self.assertEqual(self.post(**headers).status_code, 403)
        self.assertEqual(Vote.objects.filter(election=self.election).count(), 2)

    def test_deactivation_after_login_blocks_submission_without_marking_voted(self):
        response = self.client.post(
            "/api/voter/login/", {"student_id": self.student.student_id}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.student.is_active = False
        self.student.save(update_fields=["is_active"])
        self.assertEqual(self.post(**self.headers()).status_code, 403)
        self.student.refresh_from_db()
        self.assertFalse(self.student.has_voted)
        self.assertEqual(Vote.objects.count(), 0)

    @patch("core.views.Vote.objects.bulk_create", side_effect=IntegrityError)
    def test_vote_creation_failure_rolls_back_and_preserves_student_state(self, _bulk_create):
        response = self.post(**self.headers())
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Vote.objects.count(), 0)
        self.student.refresh_from_db()
        self.assertFalse(self.student.has_voted)
        self.assertTrue(self.student.is_active)

    def test_candidate_assignment_validation_is_field_level(self):
        staff = User.objects.create_user("staff", password="x", role="staff", assigned_election=self.election)
        self.client.force_authenticate(staff)
        response = self.client.post("/api/candidates/create/", {
            "student": self.other_candidate_student.id,
            "position": self.position.id,
            "ballot_number": 10,
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("student", response.data)

    def test_historical_votes_protect_related_records(self):
        self.assertEqual(self.post(**self.headers()).status_code, 201)
        from django.db.models import ProtectedError
        with self.assertRaises(ProtectedError):
            self.election.delete()
        with self.assertRaises(ProtectedError):
            self.position.delete()
        with self.assertRaises(ProtectedError):
            self.candidate.delete()

    def test_records_without_votes_can_be_deleted(self):
        election = Election.objects.create(
            name="Empty", year=2027,
            start_time=timezone.now(), end_time=timezone.now() + timedelta(hours=1)
        )
        position = Position.objects.create(name="Empty", election=election, display_order=1)
        student = self.make_student("EMPTY", election=election)
        candidate = Candidate.objects.create(student=student, position=position, ballot_number=1)
        candidate.delete()
        position.delete()
        election.delete()
        self.assertFalse(Election.objects.filter(pk=election.pk).exists())

    def test_results_and_statistics_are_election_isolated(self):
        self.assertEqual(self.post(**self.headers()).status_code, 201)
        self.assertEqual(
            self.post(self.ballot(self.other_election), **self.headers(
                self.other_election, self.other_student
            )).status_code, 201
        )
        staff = User.objects.create_user("results", password="x", role="staff", assigned_election=self.election)
        factory = APIRequestFactory()
        results_request = factory.get("/api/results/")
        force_authenticate(results_request, user=staff)
        results = ElectionResultsView.as_view()(results_request, election_id=self.election.id)
        self.assertEqual(results.data["election_id"], self.election.id)
        self.assertEqual(results.data["positions"][0]["candidates"][0]["vote_count"], 1)
        stats_request = factory.get("/api/position-stats/", {"position_id": self.position.id})
        force_authenticate(stats_request, user=staff)
        stats = PositionStatsView.as_view()(stats_request)
        self.assertEqual(stats.data["votes_for_this_position"], 1)
        candidates_request = factory.get("/api/candidates-for-position/", {"position_id": self.position.id})
        force_authenticate(candidates_request, user=staff)
        candidate_stats = CandidatesForPositionView.as_view()(candidates_request)
        self.assertEqual(candidate_stats.data[0]["vote_count"], 1)

    def test_configuration_is_locked_after_first_vote(self):
        self.assertEqual(self.post(**self.headers()).status_code, 201)
        staff = User.objects.create_user("lock-staff", password="x", role="staff", assigned_election=self.election)
        self.client.force_authenticate(staff)
        locked_detail = "Candidate and ballot changes are locked because votes have already been cast."

        create_position = self.client.post(
            "/api/positions/create/",
            {"name": "Treasurer", "election": self.election.id, "display_order": 3},
            format="json",
        )
        self.assertEqual(create_position.status_code, 400)
        self.assertEqual(create_position.data["detail"], locked_detail)
        self.assertEqual(
            self.client.put(
                f"/api/positions/{self.position.id}/",
                {"name": "Changed"},
                format="json",
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.delete(f"/api/positions/{self.position.id}/").status_code,
            400,
        )

        new_student = self.make_student("NEW-CANDIDATE", election=self.election)
        create_candidate = self.client.post(
            "/api/candidates/create/",
            {"student": new_student.id, "position": self.position.id, "ballot_number": 9},
            format="json",
        )
        self.assertEqual(create_candidate.status_code, 400)
        self.assertEqual(create_candidate.data["detail"], locked_detail)

        for data in (
            {"student": new_student.id},
            {"position": self.position_two.id, "ballot_number": 9},
            {"ballot_number": 8},
        ):
            response = self.client.put(
                f"/api/candidates/{self.candidate.id}/", data, format="json"
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["detail"], locked_detail)
        self.assertEqual(
            self.client.delete(f"/api/candidates/{self.candidate.id}/").status_code,
            400,
        )

        changed_election = ElectionSerializer(
            self.election, data={"end_time": timezone.now() + timedelta(days=1)}, partial=True
        )
        with self.assertRaises(Exception) as raised:
            changed_election.is_valid(raise_exception=True)
        self.assertIn("Election settings cannot be changed after voting activity.", str(raised.exception))

        for is_active in (False, True):
            response = self.client.patch(
                "/api/elections/manage/",
                {"election_id": self.election.id, "is_active": is_active},
                format="json",
            )
            self.assertEqual(response.status_code, 200)

        results = self.client.get(f"/api/elections/{self.election.id}/results/")
        stats = self.client.get(f"/api/elections/{self.election.id}/stats/")
        self.assertEqual(results.status_code, 200)
        self.assertEqual(stats.status_code, 200)

    def test_configuration_operations_are_allowed_before_first_vote(self):
        election = Election.objects.create(
            name="Unstarted", year=2028,
            start_time=timezone.now() + timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=2),
            voting_enabled=True,
        )
        position = Position.objects.create(
            name="Initial", election=election, display_order=1
        )
        student = Student.objects.create(
            student_id="PRE-CANDIDATE", full_name="Pre Candidate", class_name="A",
            election=election,
        )
        staff = User.objects.create_user("pre-staff", password="x", role="staff", assigned_election=election)
        self.client.force_authenticate(staff)

        created_position = self.client.post(
            "/api/positions/create/",
            {"name": "Added", "election": election.id, "display_order": 2},
            format="json",
        )
        self.assertEqual(created_position.status_code, 201)
        self.assertEqual(
            self.client.put(
                f"/api/positions/{position.id}/",
                {"name": "Renamed"},
                format="json",
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.delete(f"/api/positions/{created_position.data['id']}/").status_code,
            204,
        )
        created_candidate = self.client.post(
            "/api/candidates/create/",
            {"student": student.id, "position": position.id, "ballot_number": 1},
            format="json",
        )
        self.assertEqual(created_candidate.status_code, 201)
        candidate_id = created_candidate.data["id"]
        self.assertEqual(
            self.client.put(
                f"/api/candidates/{candidate_id}/",
                {"ballot_number": 2},
                format="json",
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.delete(f"/api/candidates/{candidate_id}/").status_code,
            204,
        )
        serializer = ElectionSerializer(
            election, data={"end_time": timezone.now() + timedelta(days=1)}, partial=True
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)


class ConcurrentVoteTests(TransactionTestCase):
    reset_sequences = True

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if not connection.features.has_select_for_update:
            return

    def test_concurrent_submissions_are_single_use_when_supported(self):
        if not connection.features.has_select_for_update:
            self.skipTest("Database does not support row-level select_for_update locking.")
        now = timezone.now()
        election = Election.objects.create(
            name="Concurrent", year=2026,
            start_time=now - timedelta(minutes=1),
            end_time=now + timedelta(minutes=10), voting_enabled=True
        )
        position = Position.objects.create(name="President", election=election, display_order=1)
        student = Student.objects.create(
            student_id="CONCURRENT", full_name="Concurrent", class_name="A",
            election=election, is_active=True
        )
        candidate_student = Student.objects.create(
            student_id="CONCURRENT-C", full_name="Candidate", class_name="A",
            election=election
        )
        candidate = Candidate.objects.create(
            student=candidate_student, position=position, ballot_number=1
        )
        payload = {"votes": [{"election": election.id, "position": position.id, "candidate": candidate.id}]}
        headers = {
            "HTTP_X_STUDENT_ID": student.student_id,
            "HTTP_X_ELECTION_ID": str(election.id),
            "HTTP_X_VOTER_TOKEN": generate_voter_hmac(f"{student.student_id}_{election.id}"),
        }
        barrier = threading.Barrier(2)

        def submit():
            from django.db import close_old_connections
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return APIClient().post("/api/vote/", payload, format="json", **headers)
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            first, second = executor.map(lambda _: submit(), (1, 2))
        self.assertCountEqual((first.status_code, second.status_code), (201, 403))
        self.assertEqual(Vote.objects.filter(voter_hash=headers["HTTP_X_VOTER_TOKEN"]).count(), 1)
