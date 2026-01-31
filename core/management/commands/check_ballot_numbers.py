from django.core.management.base import BaseCommand
from core.models import Candidate

class Command(BaseCommand):
    def handle(self, *args, **options):
        self.stdout.write('Current candidates by position:')
        for candidate in Candidate.objects.all().order_by('position_id', 'ballot_number'):
            self.stdout.write(f'Position {candidate.position_id}: {candidate.student.full_name} - Ballot {candidate.ballot_number}')
