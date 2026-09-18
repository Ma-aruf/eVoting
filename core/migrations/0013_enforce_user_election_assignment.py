from django.db import migrations, models
from django.db.models import Q


def validate_existing_user_accounts(apps, schema_editor):
    User = apps.get_model("core", "User")
    valid = (
        Q(role="superuser", is_superuser=True, assigned_election__isnull=True)
        | Q(
            role__in=["staff", "activator"],
            is_superuser=False,
            assigned_election__isnull=False,
        )
    )
    invalid = list(User.objects.exclude(valid).values("id", "username", "role"))
    if invalid:
        details = ", ".join(
            f"id={item['id']} username={item['username']} role={item['role']}"
            for item in invalid
        )
        raise RuntimeError(
            "User election-assignment migration blocked. Resolve these accounts first: "
            + details
            + ". Assign legacy staff/activators with 'python manage.py assign_user_election' "
            "or explicitly repair/recreate mismatched superuser accounts."
        )


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0012_user_assigned_election"),
    ]

    operations = [
        migrations.RunPython(validate_existing_user_accounts, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="user",
            constraint=models.CheckConstraint(
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
        ),
    ]
