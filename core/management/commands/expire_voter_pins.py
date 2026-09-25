from django.core.management.base import BaseCommand

from core.utils import deactivate_expired_voters


class Command(BaseCommand):
    help = 'Deactivate voters whose PIN or voting session has expired.'

    def handle(self, *args, **options):
        expired_count = deactivate_expired_voters()
        if expired_count:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Deactivated {expired_count} expired voter access record(s).'
                )
            )
