from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.db.models.signals import post_migrate
from django.dispatch import receiver
from .models import Student, Candidate

@receiver(post_migrate)
def create_user_roles(sender, **kwargs):
    # Create groups
    groups = ['activator', 'staff']
    for g in groups:
        Group.objects.get_or_create(name=g)

    # Assign permissions
    student_ct = ContentType.objects.get_for_model(Student)
    candidate_ct = ContentType.objects.get_for_model(Candidate)

    # Staff: full control over students
    staff_group = Group.objects.get(name='staff')
    perms_staff = Permission.objects.filter(content_type=student_ct)
    staff_group.permissions.set(perms_staff)

    # Activator: cannot add or change anything except toggle 'is_active'
    # In practice, we let Django admin handle this using get_readonly_fields
    activator_group = Group.objects.get(name='activator')
    perms_activator = Permission.objects.filter(content_type=student_ct, codename='change_student')
    activator_group.permissions.set(perms_activator)

    # Staff: full control over candidates
    perms_candidate = Permission.objects.filter(content_type=candidate_ct)
    staff_group.permissions.add(*perms_candidate)
