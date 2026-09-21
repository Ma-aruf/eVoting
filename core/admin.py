from contextlib import contextmanager

from django import forms
from django.contrib import admin
from django.contrib import messages
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .models import Election, Student, Position, Candidate, Vote, User
from .election_lifecycle import (
    ballot_change_lock_detail,
    election_ballot_ready,
    election_status,
)


@contextmanager
def _locked_ballot_elections(election_ids):
    with transaction.atomic():
        elections = Election.objects.select_for_update().filter(
            pk__in=sorted(set(election_ids))
        ).order_by("pk")
        now = timezone.now()
        for election in elections:
            detail = ballot_change_lock_detail(election, now)
            if detail:
                raise ValidationError(detail)
        yield


class BallotLockedAdminMixin:
    """Apply the same scheduled-opening freeze in Django Admin forms/actions."""

    def _election_ids(self, obj, cleaned_data=None):
        cleaned_data = cleaned_data or {}
        if isinstance(obj, Position):
            target = cleaned_data.get("election")
            ids = {target.pk} if target else set()
            if obj.pk:
                old_id = Position.objects.filter(pk=obj.pk).values_list(
                    "election_id", flat=True
                ).first()
                if old_id:
                    ids.add(old_id)
            return {election_id for election_id in ids if election_id}

        target_position = cleaned_data.get("position")
        ids = {target_position.election_id} if target_position else set()
        if obj.pk:
            old_id = Candidate.objects.filter(pk=obj.pk).values_list(
                "position__election_id", flat=True
            ).first()
            if old_id:
                ids.add(old_id)
        return ids

    def get_form(self, request, obj=None, **kwargs):
        parent_form = super().get_form(request, obj, **kwargs)
        admin_instance = self

        class BallotLockedForm(parent_form):
            def clean(form):
                cleaned_data = super().clean()
                if cleaned_data:
                    ids = admin_instance._election_ids(obj, cleaned_data)
                    for election in Election.objects.filter(pk__in=ids):
                        detail = ballot_change_lock_detail(election)
                        if detail:
                            raise forms.ValidationError(detail)
                return cleaned_data

        return BallotLockedForm

    def save_model(self, request, obj, form, change):
        with _locked_ballot_elections(self._election_ids(obj, form.cleaned_data)):
            super().save_model(request, obj, form, change)

    def delete_model(self, request, obj):
        with _locked_ballot_elections(self._election_ids(obj)):
            super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        if isinstance(self.model, type) and issubclass(self.model, Position):
            election_ids = queryset.values_list("election_id", flat=True)
        else:
            election_ids = queryset.values_list("position__election_id", flat=True)
        try:
            with _locked_ballot_elections(election_ids):
                queryset.delete()
        except ValidationError as exc:
            self.message_user(request, str(exc), level=messages.ERROR)


@admin.register(Election)
class ElectionAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "year", "start_time", "end_time", "voting_enabled", "status")
    list_filter = ("year", "voting_enabled")
    search_fields = ("name",)
    readonly_fields = ("status",)

    @admin.display(description="Calculated status")
    def status(self, obj):
        return election_status(obj)

    def get_readonly_fields(self, request, obj=None):
        if obj and election_status(obj) == "ended":
            return tuple(field.name for field in self.model._meta.fields) + ("status",)
        return super().get_readonly_fields(request, obj)

    def has_change_permission(self, request, obj=None):
        if obj and election_status(obj) == "ended":
            return False
        return super().has_change_permission(request, obj)

    def save_model(self, request, obj, form, change):
        with transaction.atomic():
            was_enabled = False
            if change:
                previous = Election.objects.select_for_update().get(pk=obj.pk)
                if election_status(previous) == "ended":
                    raise ValidationError("Ended elections cannot be changed.")
                was_enabled = previous.voting_enabled
            if obj.voting_enabled and not was_enabled and not election_ballot_ready(obj):
                raise ValidationError({
                    "voting_enabled": (
                        "Configure at least one position and add a candidate to every "
                        "position before enabling voting."
                    )
                })
            obj.full_clean()
            super().save_model(request, obj, form, change)


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ("student_id", "full_name", "class_name", "has_voted", "is_active")
    list_filter = ("class_name", "has_voted", "is_active")
    search_fields = ("student_id", "full_name")

    # Only allow activator to change 'is_active'
    def get_readonly_fields(self, request, obj=None):
        if request.user.groups.filter(name='activator').exists():
            # Activator can only toggle 'is_active', nothing else
            return [f.name for f in self.model._meta.fields if f.name != "is_active"]
        return super().get_readonly_fields(request, obj)


@admin.register(Position)
class PositionAdmin(BallotLockedAdminMixin, admin.ModelAdmin):
    list_display = ("name", "election", "display_order")
    list_filter = ("election",)
    ordering = ("display_order",)


@admin.register(Candidate)
class CandidateAdmin(BallotLockedAdminMixin, admin.ModelAdmin):
    list_display = ("student", "position")
    list_filter = ("position",)
    search_fields = ("student__full_name", "student__student_id")


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("first_name", "last_name", "role")


@admin.register(Vote)
class VoteAdmin(admin.ModelAdmin):
    list_display = ("election", "position", "candidate", "created_at")
    list_filter = ("election", "position")
    readonly_fields = ("voter_hash", "created_at")


    def has_add_permission(self, request):
        # Prevent manual vote creation from admin
        return False



