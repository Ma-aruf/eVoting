from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.models import Election, User


class Command(BaseCommand):
    help = "Assign one existing unassigned staff or activator account to an election."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True)
        parser.add_argument("--election-id", required=True, type=int)

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            user = User.objects.select_for_update().get(username=options["username"])
        except User.DoesNotExist as exc:
            raise CommandError("User not found.") from exc

        if user.role not in {"staff", "activator"}:
            raise CommandError("Only staff and activator accounts can be assigned to an election.")
        if user.assigned_election_id is not None:
            raise CommandError("This account already has an immutable election assignment.")

        try:
            election = Election.objects.get(pk=options["election_id"])
        except Election.DoesNotExist as exc:
            raise CommandError("Election not found.") from exc

        user.assigned_election = election
        User.objects.filter(pk=user.pk).update(assigned_election=election)
        self.stdout.write(self.style.SUCCESS(
            f"Assigned {user.username} ({user.role}) to {election.name} ({election.year})."
        ))
