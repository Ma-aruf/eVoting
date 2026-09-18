from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from core.models import Election

User = get_user_model()


class Command(BaseCommand):
    help = "Create or reset an activator user for testing"

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            type=str,
            default="activator1",
            help="Username for the activator (default: activator1)",
        )
        parser.add_argument(
            "--password",
            type=str,
            default="admin123",
            help="Password for the activator (default: admin123)",
        )
        parser.add_argument(
            "--election-id",
            type=int,
            required=True,
            help="Election to which the activator will be assigned",
        )

    def handle(self, *args, **options):
        username = options["username"]
        password = options["password"]
        try:
            election = Election.objects.get(pk=options["election_id"])
        except Election.DoesNotExist as exc:
            self.stderr.write(self.style.ERROR("Election not found."))
            raise SystemExit(1) from exc

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "role": "activator",
                "is_active": True,
                "is_staff": False,
                "assigned_election": election,
            },
        )

        if not created:
            self.stdout.write(f"User '{username}' already exists.")
            # Ensure the user is active and has the correct role
            user.role = "activator"
            user.is_active = True
            update_fields = ["role", "is_active"]
            if user.assigned_election_id is None:
                user.assigned_election = election
                update_fields.append("assigned_election")
            user.save(update_fields=update_fields)
            self.stdout.write(f"Updated role to 'activator' and ensured is_active=True.")

        # Always set/reset the password
        user.set_password(password)
        user.save(update_fields=["password"])

        self.stdout.write(
            self.style.SUCCESS(
                f"Activator user ready:\n"
                f"  Username: {username}\n"
                f"  Password: {password}\n"
                f"  Role: {user.role}\n"
                f"  is_active: {user.is_active}"
            )
        )
