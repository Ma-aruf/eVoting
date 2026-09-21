from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.admin.sites import site
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import RequestFactory, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .election_lifecycle import election_lifecycle, election_status, student_can_vote_now
from .models import Candidate, Election, Position, Student, Vote
from .serializers import ElectionSerializer
from .utils import generate_voter_hmac


User = get_user_model()


class ElectionLifecycleModelTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.election = Election.objects.create(
            name="Lifecycle",
            year=2026,
            start_time=self.now,
            end_time=self.now + timedelta(hours=1),
            voting_enabled=True,
        )

    def test_status_boundaries_and_manual_pause(self):
        cases = (
            (self.now - timedelta(microseconds=1), True, "scheduled", False),
            (self.now, True, "open", True),
            (self.now + timedelta(minutes=30), True, "open", True),
            (self.now + timedelta(minutes=30), False, "paused", False),
            (self.now + timedelta(hours=1), True, "ended", False),
            (self.now + timedelta(hours=2), True, "ended", False),
        )
        for now, enabled, expected_status, expected_open in cases:
            with self.subTest(now=now, enabled=enabled):
                self.election.voting_enabled = enabled
                result = election_lifecycle(self.election, now)
                self.assertEqual(election_status(self.election, now), expected_status)
                self.assertEqual(result["status"], expected_status)
                self.assertEqual(result["voting_open"], expected_open)

    def test_student_eligibility_is_separate_from_election_availability(self):
        student = Student.objects.create(
            student_id="ELIGIBLE", full_name="Eligible", class_name="A",
            election=self.election, is_active=True,
        )
        self.assertTrue(student_can_vote_now(student, self.election, self.now))
        student.is_active = False
        self.assertFalse(student_can_vote_now(student, self.election, self.now))
        student.is_active = True
        student.has_voted = True
        self.assertFalse(student_can_vote_now(student, self.election, self.now))
        student.has_voted = False
        self.assertFalse(
            student_can_vote_now(student, self.election, self.now - timedelta(seconds=1))
        )
        self.election.voting_enabled = False
        self.assertFalse(student_can_vote_now(student, self.election, self.now))


class ElectionScheduleAndManagementTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.election = Election.objects.create(
            name="Schedule", year=2026,
            start_time=self.now + timedelta(hours=1),
            end_time=self.now + timedelta(hours=2),
            voting_enabled=False,
        )
        self.staff = User.objects.create_user(
            username="lifecycle-staff", password="test", role="staff",
            assigned_election=self.election,
        )
        self.activator = User.objects.create_user(
            username="lifecycle-activator", password="test", role="activator",
            assigned_election=self.election,
        )
        self.superuser = User.objects.create_superuser(
            username="lifecycle-root", email="root@example.test", password="test",
        )
        self.client = APIClient()

    def _make_ballot_ready(self):
        student = Student.objects.create(
            student_id="READY-CANDIDATE", full_name="Candidate", class_name="A",
            election=self.election,
        )
        position = Position.objects.create(
            name="President", election=self.election, display_order=1,
        )
        Candidate.objects.create(student=student, position=position, ballot_number=1)

    def test_schedule_serializer_accepts_valid_and_rejects_equal_or_reversed_times(self):
        valid = ElectionSerializer(data={
            "name": "Valid", "year": 2027,
            "start_time": self.now, "end_time": self.now + timedelta(seconds=1),
            "voting_enabled": False,
        })
        self.assertTrue(valid.is_valid(), valid.errors)

        for end_time in (self.now, self.now - timedelta(seconds=1)):
            serializer = ElectionSerializer(data={
                "name": "Invalid", "year": 2027,
                "start_time": self.now, "end_time": end_time,
                "voting_enabled": True,
            })
            self.assertFalse(serializer.is_valid())
            self.assertEqual(
                serializer.errors["end_time"][0],
                "The election must end after its starting time.",
            )

        enabled_at_creation = ElectionSerializer(data={
            "name": "Enabled too early", "year": 2027,
            "start_time": self.now + timedelta(hours=1),
            "end_time": self.now + timedelta(hours=2),
            "voting_enabled": True,
        })
        self.assertFalse(enabled_at_creation.is_valid())
        self.assertIn("voting_enabled", enabled_at_creation.errors)

    def test_invalid_schedule_update_is_rejected(self):
        serializer = ElectionSerializer(
            self.election,
            data={"end_time": self.election.start_time},
            partial=True,
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("end_time", serializer.errors)

    def test_database_constraint_rejects_invalid_schedule_without_serializer(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Election.objects.create(
                    name="Database constraint test",
                    year=2027,
                    start_time=self.now,
                    end_time=self.now,
                    voting_enabled=False,
                )

    def test_start_time_cannot_be_moved_forward_after_original_opening(self):
        self.election.start_time = self.now - timedelta(minutes=1)
        self.election.end_time = self.now + timedelta(hours=3)
        serializer = ElectionSerializer(
            self.election,
            data={"start_time": self.now + timedelta(hours=1)},
            partial=True,
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("scheduled start time cannot be moved", str(serializer.errors).lower())

    def test_model_validation_prevents_admin_style_start_time_unlock(self):
        self.election.start_time = self.now - timedelta(minutes=1)
        self.election.end_time = self.now + timedelta(hours=3)
        self.election.save(update_fields=["start_time", "end_time"])
        self.election.start_time = self.now + timedelta(hours=1)
        self.election.end_time = self.now + timedelta(hours=4)
        with self.assertRaises(ValidationError) as raised:
            self.election.full_clean()
        self.assertIn("scheduled start time cannot be moved", str(raised.exception).lower())

        request = RequestFactory().post("/admin/core/election/")
        request.user = self.superuser
        election_admin = site._registry[Election]
        with self.assertRaises(ValidationError):
            election_admin.save_model(
                request, self.election, SimpleNamespace(cleaned_data={}), change=True
            )

    def test_create_endpoint_rejects_invalid_schedule(self):
        self.client.force_authenticate(self.superuser)
        response = self.client.post("/api/elections/create/", {
            "name": "Bad schedule", "year": 2027,
            "start_time": self.now.isoformat(), "end_time": self.now.isoformat(),
            "voting_enabled": False,
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["end_time"],
            ["The election must end after its starting time."],
        )

    def test_enable_pause_status_and_permissions(self):
        self._make_ballot_ready()
        self.client.force_authenticate(self.staff)
        response = self.client.patch("/api/elections/manage/", {
            "election_id": self.election.pk, "voting_enabled": True,
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "scheduled")
        self.assertFalse(response.data["voting_open"])

        self.election.start_time = self.now - timedelta(minutes=1)
        self.election.end_time = self.now + timedelta(minutes=1)
        self.election.save(update_fields=["start_time", "end_time"])
        response = self.client.patch("/api/elections/manage/", {
            "election_id": self.election.pk, "voting_enabled": True,
        }, format="json")
        self.assertEqual(response.data["status"], "open")
        self.assertTrue(response.data["voting_open"])

        response = self.client.patch("/api/elections/manage/", {
            "election_id": self.election.pk, "voting_enabled": False,
        }, format="json")
        self.assertEqual(response.data["status"], "paused")
        self.assertFalse(response.data["voting_open"])

        self.election.end_time = self.now - timedelta(seconds=1)
        self.election.save(update_fields=["end_time"])
        response = self.client.patch("/api/elections/manage/", {
            "election_id": self.election.pk, "voting_enabled": True,
        }, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["detail"], "Ended elections cannot be changed.")
        self.election.refresh_from_db()
        self.assertFalse(self.election.voting_enabled)

        # An ended election may retain an enabled switch; neither direction
        # of the management toggle can change it after closing.
        self.election.voting_enabled = True
        self.election.save(update_fields=["voting_enabled"])
        response = self.client.patch("/api/elections/manage/", {
            "election_id": self.election.pk, "voting_enabled": False,
        }, format="json")
        self.assertEqual(response.status_code, 409)
        self.election.refresh_from_db()
        self.assertTrue(self.election.voting_enabled)

        self.client.force_authenticate(self.activator)
        denied = self.client.patch("/api/elections/manage/", {
            "election_id": self.election.pk, "voting_enabled": False,
        }, format="json")
        self.assertEqual(denied.status_code, 403)

    def test_django_admin_rejects_changes_to_ended_elections(self):
        self.election.start_time = self.now - timedelta(hours=2)
        self.election.end_time = self.now - timedelta(seconds=1)
        self.election.save(update_fields=["start_time", "end_time"])
        request = RequestFactory().post("/admin/core/election/")
        request.user = self.superuser
        election_admin = site._registry[Election]

        self.assertFalse(election_admin.has_change_permission(request, self.election))
        readonly_fields = election_admin.get_readonly_fields(request, self.election)
        self.assertTrue(all(field.name in readonly_fields for field in Election._meta.fields))

        self.election.name = "Changed after close"
        with self.assertRaisesMessage(ValidationError, "Ended elections cannot be changed."):
            election_admin.save_model(
                request,
                self.election,
                SimpleNamespace(cleaned_data={}),
                change=True,
            )
        self.election.refresh_from_db()
        self.assertEqual(self.election.name, "Schedule")

    def test_legacy_alias_maps_to_the_single_manual_field(self):
        self._make_ballot_ready()
        self.client.force_authenticate(self.staff)
        response = self.client.patch("/api/elections/manage/", {
            "election_id": self.election.pk, "is_active": True,
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.election.refresh_from_db()
        self.assertTrue(self.election.voting_enabled)
        self.assertEqual(response.data["is_active"], True)
        self.assertEqual(response.data["voting_enabled"], True)

        agreeing_fields = self.client.patch("/api/elections/manage/", {
            "election_id": self.election.pk,
            "is_active": False,
            "voting_enabled": False,
        }, format="json")
        self.assertEqual(agreeing_fields.status_code, 200, agreeing_fields.data)
        self.election.refresh_from_db()
        self.assertFalse(self.election.voting_enabled)
        self.assertFalse(agreeing_fields.data["is_active"])
        self.assertFalse(agreeing_fields.data["voting_enabled"])

        # The canonical field is also accepted by itself (the legacy alias
        # above is accepted by itself during the compatibility period).
        canonical_only = self.client.patch("/api/elections/manage/", {
            "election_id": self.election.pk,
            "voting_enabled": True,
        }, format="json")
        self.assertEqual(canonical_only.status_code, 200, canonical_only.data)

        conflict = self.client.patch("/api/elections/manage/", {
            "election_id": self.election.pk,
            "is_active": False,
            "voting_enabled": True,
        }, format="json")
        self.assertEqual(conflict.status_code, 400)
        self.assertIn("Conflicts with the deprecated is_active field.", str(conflict.data))

    def test_enabling_voting_requires_a_configured_ballot(self):
        self.client.force_authenticate(self.staff)
        response = self.client.patch("/api/elections/manage/", {
            "election_id": self.election.pk, "voting_enabled": True,
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("candidate to every position", response.data["detail"])
        self.election.refresh_from_db()
        self.assertFalse(self.election.voting_enabled)

    def test_scheduled_election_schedule_can_be_changed_and_audited(self):
        self.client.force_authenticate(self.staff)
        new_start = self.now + timedelta(hours=3)
        new_end = self.now + timedelta(hours=4)
        response = self.client.patch(
            f"/api/elections/{self.election.pk}/schedule/",
            {"start_time": new_start.isoformat(), "end_time": new_end.isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "scheduled")
        self.election.refresh_from_db()
        self.assertEqual(self.election.start_time, new_start)
        self.assertEqual(self.election.end_time, new_end)
        entry = LogEntry.objects.get(
            content_type=ContentType.objects.get_for_model(Election),
            object_id=str(self.election.pk),
        )
        self.assertEqual(entry.user, self.staff)
        self.assertIn(new_start.isoformat(), entry.change_message)
        self.assertIn(new_end.isoformat(), entry.change_message)

    def test_schedule_edit_rejects_invalid_times_and_non_scheduled_elections(self):
        self.client.force_authenticate(self.staff)
        invalid = self.client.patch(
            f"/api/elections/{self.election.pk}/schedule/",
            {
                "start_time": (self.now + timedelta(hours=2)).isoformat(),
                "end_time": (self.now + timedelta(hours=1)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("end_time", invalid.data)

        self.election.start_time = self.now - timedelta(minutes=1)
        self.election.end_time = self.now + timedelta(hours=1)
        self.election.save(update_fields=["start_time", "end_time"])
        started = self.client.patch(
            f"/api/elections/{self.election.pk}/schedule/",
            {
                "start_time": (self.now + timedelta(hours=2)).isoformat(),
                "end_time": (self.now + timedelta(hours=3)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(started.status_code, 409)

    def test_schedule_edit_permissions_and_votes_lock(self):
        request_data = {
            "start_time": (self.now + timedelta(hours=3)).isoformat(),
            "end_time": (self.now + timedelta(hours=4)).isoformat(),
        }
        self.client.force_authenticate(self.activator)
        denied = self.client.patch(
            f"/api/elections/{self.election.pk}/schedule/", request_data, format="json"
        )
        self.assertEqual(denied.status_code, 403)

        other_election = Election.objects.create(
            name="Out of scope schedule", year=2027,
            start_time=self.now + timedelta(hours=2),
            end_time=self.now + timedelta(hours=3),
            voting_enabled=False,
        )
        self.client.force_authenticate(self.staff)
        out_of_scope = self.client.patch(
            f"/api/elections/{other_election.pk}/schedule/",
            request_data,
            format="json",
        )
        self.assertEqual(out_of_scope.status_code, 404)

        self.client.force_authenticate(self.superuser)
        superuser_allowed = self.client.patch(
            f"/api/elections/{other_election.pk}/schedule/",
            request_data,
            format="json",
        )
        self.assertEqual(superuser_allowed.status_code, 200, superuser_allowed.data)

        student = Student.objects.create(
            student_id="SCHEDULE-VOTER", full_name="Voter", class_name="A",
            election=self.election,
        )
        position = Position.objects.create(
            name="Schedule lock", election=self.election, display_order=1,
        )
        candidate = Candidate.objects.create(student=student, position=position, ballot_number=1)
        Vote.objects.create(
            election=self.election, position=position, candidate=candidate,
            voter_hash="schedule-vote-lock",
        )
        self.client.force_authenticate(self.staff)
        locked = self.client.patch(
            f"/api/elections/{self.election.pk}/schedule/", request_data, format="json"
        )
        self.assertEqual(locked.status_code, 409)

    def _make_election_open_or_paused(self, voting_enabled=True):
        self.election.start_time = self.now - timedelta(minutes=30)
        self.election.end_time = self.now + timedelta(hours=1)
        self.election.voting_enabled = voting_enabled
        self.election.save(update_fields=["start_time", "end_time", "voting_enabled"])
        self.election.refresh_from_db()

    def test_staff_can_extend_open_election_and_admin_history_audits_reason_and_times(self):
        self._make_election_open_or_paused(voting_enabled=True)
        old_end_time = self.election.end_time

        # Existing votes do not prevent extending the voting window.
        student = Student.objects.create(
            student_id="EXTEND-VOTER", full_name="Voter", class_name="A",
            election=self.election,
        )
        position = Position.objects.create(
            name="President", election=self.election, display_order=1,
        )
        candidate = Candidate.objects.create(
            student=student, position=position, ballot_number=1,
        )
        Vote.objects.create(
            election=self.election, position=position, candidate=candidate,
            voter_hash="extension-test-voter-hash",
        )

        new_end_time = self.now + timedelta(hours=3)
        reason = "Late opening reduced the scheduled voting window."
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            f"/api/elections/{self.election.pk}/extend/",
            {"end_time": new_end_time.isoformat(), "reason": reason},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["detail"], "Election closing time extended.")
        self.assertEqual(response.data["status"], "open")
        self.assertTrue(response.data["voting_enabled"])
        self.assertTrue(response.data["voting_open"])
        self.election.refresh_from_db()
        self.assertEqual(self.election.end_time, new_end_time)
        self.assertTrue(self.election.voting_enabled)

        content_type = ContentType.objects.get_for_model(Election)
        entry = LogEntry.objects.get(
            user=self.staff,
            content_type=content_type,
            object_id=str(self.election.pk),
            action_flag=CHANGE,
        )
        self.assertIn(old_end_time.isoformat(), entry.change_message)
        self.assertIn(new_end_time.isoformat(), entry.change_message)
        self.assertIn(reason, entry.change_message)

    def test_superuser_can_extend_paused_election_without_enabling_voting(self):
        self._make_election_open_or_paused(voting_enabled=False)
        new_end_time = self.now + timedelta(hours=4)
        self.client.force_authenticate(self.superuser)

        response = self.client.post(
            f"/api/elections/{self.election.pk}/extend/",
            {"end_time": new_end_time.isoformat(), "reason": "Pause needs more time."},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "paused")
        self.assertFalse(response.data["voting_enabled"])
        self.assertFalse(response.data["voting_open"])

    def test_extension_is_rejected_for_scheduled_and_ended_elections(self):
        self.client.force_authenticate(self.staff)
        request_data = {
            "end_time": (self.now + timedelta(hours=4)).isoformat(),
            "reason": "Attempted extension.",
        }
        cases = (
            (self.now + timedelta(hours=1), self.now + timedelta(hours=2), "scheduled"),
            (self.now - timedelta(hours=2), self.now - timedelta(hours=1), "ended"),
        )
        for start_time, end_time, expected_status in cases:
            with self.subTest(status=expected_status):
                Election.objects.filter(pk=self.election.pk).update(
                    start_time=start_time,
                    end_time=end_time,
                    voting_enabled=True,
                )
                response = self.client.post(
                    f"/api/elections/{self.election.pk}/extend/",
                    request_data,
                    format="json",
                )
                self.assertEqual(response.status_code, 409)
                self.assertIn("open or paused", response.data["detail"])
                self.assertEqual(election_status(
                    Election.objects.get(pk=self.election.pk), self.now
                ), expected_status)

    def test_extension_is_rejected_at_the_exact_ending_time(self):
        self.election.start_time = self.now - timedelta(hours=1)
        self.election.end_time = self.now
        self.election.voting_enabled = True
        self.election.save(update_fields=["start_time", "end_time", "voting_enabled"])
        self.client.force_authenticate(self.staff)

        with patch("core.views.timezone.now", return_value=self.now):
            response = self.client.post(
                f"/api/elections/{self.election.pk}/extend/",
                {
                    "end_time": (self.now + timedelta(hours=1)).isoformat(),
                    "reason": "Attempted at the ending boundary.",
                },
                format="json",
            )

        self.assertEqual(response.status_code, 409)
        self.election.refresh_from_db()
        self.assertEqual(self.election.end_time, self.now)

    def test_extension_rejects_a_close_time_that_is_not_later_than_the_current_one(self):
        self._make_election_open_or_paused()
        old_end_time = self.election.end_time
        self.client.force_authenticate(self.staff)

        for submitted_end_time in (old_end_time, old_end_time - timedelta(seconds=1)):
            with self.subTest(end_time=submitted_end_time):
                response = self.client.post(
                    f"/api/elections/{self.election.pk}/extend/",
                    {"end_time": submitted_end_time.isoformat(), "reason": "Longer voting window."},
                    format="json",
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn("later than the current closing time", str(response.data))

        missing_reason = self.client.post(
            f"/api/elections/{self.election.pk}/extend/",
            {"end_time": (old_end_time + timedelta(hours=1)).isoformat(), "reason": "   "},
            format="json",
        )
        self.assertEqual(missing_reason.status_code, 400)
        self.assertIn("reason", missing_reason.data)

    def test_extension_permissions_and_staff_election_scope(self):
        self._make_election_open_or_paused()
        other_election = Election.objects.create(
            name="Other open election", year=2027,
            start_time=self.now - timedelta(minutes=5),
            end_time=self.now + timedelta(hours=1),
            voting_enabled=True,
        )
        request_data = {
            "end_time": (self.now + timedelta(hours=3)).isoformat(),
            "reason": "Approved extension.",
        }

        self.client.force_authenticate(self.activator)
        denied = self.client.post(
            f"/api/elections/{self.election.pk}/extend/", request_data, format="json"
        )
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(self.staff)
        out_of_scope = self.client.post(
            f"/api/elections/{other_election.pk}/extend/", request_data, format="json"
        )
        self.assertEqual(out_of_scope.status_code, 404)

        self.client.force_authenticate(self.superuser)
        allowed = self.client.post(
            f"/api/elections/{other_election.pk}/extend/", request_data, format="json"
        )
        self.assertEqual(allowed.status_code, 200, allowed.data)


class ElectionActivationReadinessTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.election = Election.objects.create(
            name="Activation readiness", year=2026,
            start_time=self.now - timedelta(minutes=10),
            end_time=self.now + timedelta(hours=1),
            voting_enabled=True,
        )
        self.staff = User.objects.create_user(
            username="activation-staff", password="test", role="staff",
            assigned_election=self.election,
        )
        self.student = Student.objects.create(
            student_id="ACTIVATION-VOTER", full_name="Voter", class_name="A",
            election=self.election,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.staff)

    def activate_student(self):
        return self.client.post("/api/students/activate/", {
            "student_id": self.student.student_id,
            "election_id": self.election.pk,
            "is_active": True,
        }, format="json")

    def test_voter_activation_is_blocked_before_start_even_when_enabled(self):
        self.election.start_time = self.now + timedelta(hours=1)
        self.election.end_time = self.now + timedelta(hours=2)
        self.election.save(update_fields=["start_time", "end_time"])
        response = self.activate_student()
        self.assertEqual(response.status_code, 403)
        self.assertIn("only be activated while voting is open", response.data["detail"])

    def test_voter_activation_is_blocked_while_paused_and_after_end(self):
        self.election.voting_enabled = False
        self.election.save(update_fields=["voting_enabled"])
        paused = self.activate_student()
        self.assertEqual(paused.status_code, 403)
        self.assertIn("currently paused", paused.data["detail"])

        self.election.voting_enabled = True
        self.election.end_time = self.now - timedelta(seconds=1)
        self.election.save(update_fields=["voting_enabled", "end_time"])
        ended = self.activate_student()
        self.assertEqual(ended.status_code, 403)
        self.assertIn("after voting has ended", ended.data["detail"])

    def test_voter_activation_requires_a_position_and_a_candidate_for_every_position(self):
        no_positions = self.activate_student()
        self.assertEqual(no_positions.status_code, 403)
        self.assertIn("at least one position", no_positions.data["detail"])

        position = Position.objects.create(
            name="President", election=self.election, display_order=1,
        )
        no_candidate = self.activate_student()
        self.assertEqual(no_candidate.status_code, 403)
        self.assertIn("candidate to every position", no_candidate.data["detail"])

        candidate_student = Student.objects.create(
            student_id="ACTIVATION-CANDIDATE", full_name="Candidate", class_name="A",
            election=self.election,
        )
        Candidate.objects.create(
            student=candidate_student, position=position, ballot_number=1,
        )
        second_position = Position.objects.create(
            name="Secretary", election=self.election, display_order=2,
        )
        incomplete = self.activate_student()
        self.assertEqual(incomplete.status_code, 403)
        self.assertIn("candidate to every position", incomplete.data["detail"])

        second_candidate = Student.objects.create(
            student_id="ACTIVATION-CANDIDATE-2", full_name="Candidate Two", class_name="A",
            election=self.election,
        )
        Candidate.objects.create(
            student=second_candidate, position=second_position, ballot_number=1,
        )
        ready = self.activate_student()
        self.assertEqual(ready.status_code, 200, ready.data)
        self.student.refresh_from_db()
        self.assertTrue(self.student.is_active)

    def test_django_admin_cannot_enable_an_unready_ballot(self):
        request = RequestFactory().post("/admin/core/election/")
        request.user = self.staff
        Election.objects.filter(pk=self.election.pk).update(voting_enabled=False)
        self.election.voting_enabled = True
        election_admin = site._registry[Election]
        with self.assertRaises(ValidationError):
            election_admin.save_model(
                request,
                self.election,
                SimpleNamespace(cleaned_data={}),
                change=True,
            )

    def test_voter_login_returns_the_matching_lifecycle_state_without_a_token(self):
        cases = (
            (
                self.now + timedelta(hours=1),
                self.now + timedelta(hours=2),
                True,
                "Voting has not started yet.",
            ),
            (
                self.now - timedelta(minutes=1),
                self.now + timedelta(hours=1),
                False,
                "Voting is currently paused. Please try again later.",
            ),
            (
                self.now - timedelta(hours=2),
                self.now - timedelta(seconds=1),
                True,
                "Voting has ended.",
            ),
        )
        for start_time, end_time, enabled, expected_detail in cases:
            with self.subTest(detail=expected_detail):
                self.election.start_time = start_time
                self.election.end_time = end_time
                self.election.voting_enabled = enabled
                self.election.save(update_fields=["start_time", "end_time", "voting_enabled"])
                response = self.client.post(
                    "/api/voter/login/", {"student_id": self.student.student_id}, format="json"
                )
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.data["detail"], expected_detail)
                self.assertNotIn("token", response.data)

    def test_voter_login_rejects_an_open_election_with_an_unready_ballot(self):
        self.student.is_active = True
        self.student.save(update_fields=["is_active"])
        response = self.client.post(
            "/api/voter/login/", {"student_id": self.student.student_id}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("ballot is not ready", response.data["detail"])
        self.assertNotIn("token", response.data)

    def test_paused_voter_authentication_returns_a_clear_pause_error(self):
        self.student.is_active = True
        self.student.save(update_fields=["is_active"])
        self.election.voting_enabled = False
        self.election.save(update_fields=["voting_enabled"])
        token = generate_voter_hmac(f"{self.student.student_id}_{self.election.pk}")
        voter_client = APIClient()
        response = voter_client.get(
            "/api/positions/",
            {"election_id": self.election.pk},
            HTTP_X_STUDENT_ID=self.student.student_id,
            HTTP_X_ELECTION_ID=str(self.election.pk),
            HTTP_X_VOTER_TOKEN=token,
        )
        self.assertIn(response.status_code, (401, 403))
        self.assertIn("paused", response.data["detail"].lower())


class CandidateBallotLockTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.election = Election.objects.create(
            name="Ballot lock", year=2026,
            start_time=now + timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            voting_enabled=True,
        )
        self.staff = User.objects.create_user(
            username="ballot-staff", password="test", role="staff",
            assigned_election=self.election,
        )
        self.position = Position.objects.create(
            name="President", election=self.election, display_order=1,
        )
        self.students = [
            Student.objects.create(
                student_id=f"CAND-{i}", full_name=f"Candidate {i}",
                class_name="A", election=self.election,
            )
            for i in range(1, 5)
        ]
        self.candidate = Candidate.objects.create(
            student=self.students[0], position=self.position, ballot_number=1,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.staff)

    def test_candidate_create_edit_delete_allowed_before_scheduled_opening(self):
        created = self.client.post("/api/candidates/create/", {
            "student": self.students[1].pk, "position": self.position.pk,
            "ballot_number": 2,
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        candidate_id = created.data["id"]
        edited = self.client.patch(
            f"/api/candidates/{candidate_id}/", {"ballot_number": 3}, format="json"
        )
        self.assertEqual(edited.status_code, 200, edited.data)
        deleted = self.client.delete(f"/api/candidates/{candidate_id}/")
        self.assertEqual(deleted.status_code, 204)

    @patch("core.views.timezone.now")
    def test_candidate_and_position_changes_are_blocked_at_opening_even_when_paused(self, mocked_now):
        self.election.voting_enabled = False
        self.election.save(update_fields=["voting_enabled"])

        for now in (self.election.start_time, self.election.start_time + timedelta(minutes=1)):
            with self.subTest(now=now):
                mocked_now.return_value = now
                create = self.client.post("/api/candidates/create/", {
                    "student": self.students[1].pk, "position": self.position.pk,
                    "ballot_number": 2,
                }, format="json")
                self.assertEqual(create.status_code, 400)
                self.assertIn("election has started", create.data["detail"].lower())

                edit = self.client.patch(
                    f"/api/candidates/{self.candidate.pk}/", {"ballot_number": 2}, format="json"
                )
                self.assertEqual(edit.status_code, 400)
                delete = self.client.delete(f"/api/candidates/{self.candidate.pk}/")
                self.assertEqual(delete.status_code, 400)

                position_edit = self.client.patch(
                    f"/api/positions/{self.position.pk}/", {"name": "Changed"}, format="json"
                )
                self.assertEqual(position_edit.status_code, 400)
                position_delete = self.client.delete(f"/api/positions/{self.position.pk}/")
                self.assertEqual(position_delete.status_code, 400)

    def test_existing_vote_locks_ballot_before_the_scheduled_opening(self):
        self.election.start_time = timezone.now() + timedelta(hours=1)
        self.election.save(update_fields=["start_time"])
        from .models import Vote

        Vote.objects.create(
            election=self.election, position=self.position,
            candidate=self.candidate, voter_hash="prior-vote-hash",
        )
        response = self.client.post("/api/candidates/create/", {
            "student": self.students[1].pk, "position": self.position.pk,
            "ballot_number": 2,
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("votes have already been cast", response.data["detail"].lower())

    def test_django_admin_save_delete_and_bulk_delete_respect_ballot_lock(self):
        now = timezone.now()
        self.election.start_time = now - timedelta(minutes=1)
        self.election.end_time = now + timedelta(hours=1)
        self.election.save(update_fields=["start_time", "end_time"])

        request = RequestFactory().post("/admin/")
        request.user = self.staff
        position_admin = site._registry[Position]
        candidate_admin = site._registry[Candidate]

        new_position = Position(
            name="Vice President", election=self.election, display_order=2,
        )
        with self.assertRaises(ValidationError):
            position_admin.save_model(
                request,
                new_position,
                SimpleNamespace(cleaned_data={"election": self.election}),
                change=False,
            )

        new_candidate = Candidate(
            student=self.students[1], position=self.position, ballot_number=2,
        )
        with self.assertRaises(ValidationError):
            candidate_admin.save_model(
                request,
                new_candidate,
                SimpleNamespace(cleaned_data={"position": self.position}),
                change=False,
            )

        with self.assertRaises(ValidationError):
            position_admin.delete_model(request, self.position)
        with self.assertRaises(ValidationError):
            candidate_admin.delete_model(request, self.candidate)

        for model_admin, queryset in (
            (position_admin, Position.objects.filter(pk=self.position.pk)),
            (candidate_admin, Candidate.objects.filter(pk=self.candidate.pk)),
        ):
            with self.subTest(model=model_admin.model.__name__):
                with patch.object(model_admin, "message_user"):
                    model_admin.delete_queryset(request, queryset)
                self.assertTrue(queryset.exists())
