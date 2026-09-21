from django.db import models
from django.db.models import F, Q
from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.core.exceptions import ValidationError
from django.utils import timezone


class UserManager(DjangoUserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("role", "superuser")
        extra_fields["is_superuser"] = True
        extra_fields["is_staff"] = True
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    ROLE_CHOICES = (
        ("superuser", "Superuser"),
        ("staff", "Staff"),
        ("activator", "Activator"),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="staff")
    assigned_election = models.ForeignKey(
        "Election",
        on_delete=models.CASCADE,
        related_name="assigned_users",
        null=True,
        blank=True,
    )

    objects = UserManager()

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    (
                        Q(role="superuser")
                        & Q(is_superuser=True)
                        & Q(assigned_election__isnull=True)
                    )
                    | (
                        Q(role__in=["staff", "activator"])
                        & Q(is_superuser=False)
                        & Q(assigned_election__isnull=False)
                    )
                ),
                name="user_role_election_consistent",
            ),
        ]

    def clean(self):
        super().clean()

        if self.pk:
            original_election_id = type(self).objects.filter(pk=self.pk).values_list(
                "assigned_election_id", flat=True
            ).first()
            if original_election_id != self.assigned_election_id:
                raise ValidationError({
                    "assigned_election": "Election assignment cannot be changed after account creation."
                })

        if (self.role == "superuser") != bool(self.is_superuser):
            raise ValidationError({
                "role": "The role and Django superuser authority must agree."
            })

        if self.role == "superuser" and self.assigned_election_id is not None:
            raise ValidationError({
                "assigned_election": "Superusers cannot be assigned to an election."
            })

        if self.role in {"staff", "activator"} and self.assigned_election_id is None:
            raise ValidationError({
                "assigned_election": "Staff and activator accounts must be assigned to an election."
            })

    def __str__(self):
        return f"{self.username} ({self.role})"


class Election(models.Model):
    name = models.CharField(max_length=100)
    year = models.PositiveIntegerField()
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    voting_enabled = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(end_time__gt=F("start_time")),
                name="election_end_after_start",
            ),
        ]

    @property
    def status(self):
        from .election_lifecycle import election_status

        return election_status(self)

    @property
    def voting_open(self):
        from .election_lifecycle import election_lifecycle

        return election_lifecycle(self, include_candidate_lock=False)["voting_open"]

    @property
    def candidate_changes_locked(self):
        from .election_lifecycle import candidate_changes_locked

        return candidate_changes_locked(self)

    def clean(self):
        super().clean()
        errors = {}
        if (
            self.start_time is not None
            and self.end_time is not None
            and self.end_time <= self.start_time
        ):
            errors["end_time"] = "The election must end after its starting time."

        if self.pk:
            from .election_lifecycle import START_TIME_LOCKED_DETAIL
            from .utils import election_has_votes

            original = type(self).objects.filter(pk=self.pk).values(
                "name", "year", "start_time", "end_time"
            ).first()
            if original:
                if (
                    self.start_time is not None
                    and timezone.now() >= original["start_time"]
                    and self.start_time > original["start_time"]
                ):
                    errors["start_time"] = START_TIME_LOCKED_DETAIL
                if election_has_votes(self.pk) and any(
                    getattr(self, field) != original[field]
                    for field in ("name", "year", "start_time", "end_time")
                ):
                    errors["__all__"] = (
                        "Election settings cannot be changed after voting activity."
                    )

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.name}, ({self.year})"


class Student(models.Model):
    student_id = models.CharField(max_length=30)
    full_name = models.CharField(max_length=100)
    class_name = models.CharField(max_length=50)
    has_voted = models.BooleanField(default=False)
    is_active = models.BooleanField(default=False)
    election = models.ForeignKey(Election, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['election', 'student_id'], name='unique_election_student')
        ]

    def __str__(self):
        return f"{self.full_name} - {self.student_id} ({self.election.name})"


class Position(models.Model):
    name = models.CharField(max_length=100)
    election = models.ForeignKey(Election, on_delete=models.CASCADE)
    display_order = models.PositiveIntegerField()

    def __str__(self):
        return self.name


class Candidate(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    position = models.ForeignKey(Position, on_delete=models.CASCADE)
    photo_url = models.URLField(blank=True)
    ballot_number = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['position', 'ballot_number'], name='unique_position_ballot_number'),
            models.UniqueConstraint(fields=['student'], name='unique_student_candidate')
        ]

    def __str__(self):
        return f"{self.student.full_name} for {self.position.name}"


class Vote(models.Model):
    election = models.ForeignKey(Election, on_delete=models.PROTECT)
    position = models.ForeignKey(Position, on_delete=models.PROTECT)
    candidate = models.ForeignKey(Candidate, on_delete=models.PROTECT)
    voter_hash = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('voter_hash', 'position')

    def __str__(self):
        return f"Vote for {self.candidate}"
