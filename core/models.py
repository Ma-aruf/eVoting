from django.db import models
from django.db.models import Q
from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.core.exceptions import ValidationError


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
    is_active = models.BooleanField(default=False)

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
