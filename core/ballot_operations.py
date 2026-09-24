from contextlib import contextmanager

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .election_lifecycle import ballot_change_lock_detail
from .models import Election


@contextmanager
def lock_elections_for_ballot_change(*election_ids):
    """Lock affected elections and enforce the shared ballot freeze rule."""
    ids = sorted({int(election_id) for election_id in election_ids if election_id})

    with transaction.atomic():
        elections = list(
            Election.objects.select_for_update()
            .filter(pk__in=ids)
            .order_by('pk')
        )
        now = timezone.now()

        for election in elections:
            detail = ballot_change_lock_detail(election, now)
            if detail:
                raise serializers.ValidationError({'detail': detail})

        yield {election.pk: election for election in elections}
