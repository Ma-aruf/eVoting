from django.db import models
from django.contrib.auth.models import User


class Election(models.Model):
    name = models.CharField(max_length=100)
    year = models.PositiveIntegerField()
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    is_active = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.name}, ({self.year})"


class Student(models.Model):
    student_id = models.CharField(max_length=30, unique=True)
    full_name = models.CharField(max_length=100)
    class_name = models.CharField(max_length=50)
    has_voted = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.full_name} - {self.student_id}"


class Position(models.Model):
    name = models.CharField(max_length=100)
    election = models.ForeignKey(Election, on_delete=models.CASCADE)
    display_order = models.PositiveIntegerField()

    def __str__(self):
        return self.name


class Candidate(models.Model):
    student = models.OneToOneField(Student, on_delete=models.CASCADE)
    position = models.ForeignKey(Position, on_delete=models.CASCADE)
    photo_url = models.URLField(blank=True)

    def __str__(self):
        return f"{self.student.full_name} for {self.position.name}"


class Vote(models.Model):
    election = models.ForeignKey(Election, on_delete=models.CASCADE)
    position = models.ForeignKey(Position, on_delete=models.CASCADE)
    candidate = models.ForeignKey(Candidate, on_delete=models.CASCADE)
    voter_hash = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('voter_hash', 'position')

    def __str__(self):
        return f"Vote for {self.candidate}"
