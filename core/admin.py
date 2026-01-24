from django.contrib import admin
from .models import Election, Student, Position, Candidate, Vote, User


@admin.register(Election)
class ElectionAdmin(admin.ModelAdmin):
    list_display = ("id","name", "year", "start_time", "end_time", "is_active")
    list_filter = ("year", "is_active")
    search_fields = ("name",)


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
class PositionAdmin(admin.ModelAdmin):
    list_display = ("name", "election", "display_order")
    list_filter = ("election",)
    ordering = ("display_order",)


@admin.register(Candidate)
class CandidateAdmin(admin.ModelAdmin):
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



