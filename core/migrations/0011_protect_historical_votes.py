from django.db import migrations, models
from django.db.models import F
import django.db.models.deletion


def validate_vote_relationships(apps, schema_editor):
    Candidate = apps.get_model("core", "Candidate")
    Vote = apps.get_model("core", "Vote")

    invalid_candidates = list(
        Candidate.objects.exclude(
            student__election_id=F("position__election_id")
        ).values_list("id", flat=True)[:20]
    )
    invalid_vote_elections = list(
        Vote.objects.exclude(
            election_id=F("position__election_id")
        ).values_list("id", flat=True)[:20]
    )
    invalid_vote_positions = list(
        Vote.objects.exclude(
            position_id=F("candidate__position_id")
        ).values_list("id", flat=True)[:20]
    )
    invalid_vote_candidate_elections = list(
        Vote.objects.exclude(
            election_id=F("candidate__student__election_id")
        ).values_list("id", flat=True)[:20]
    )

    problems = []
    if invalid_candidates:
        problems.append(f"candidate assignment IDs: {invalid_candidates}")
    if invalid_vote_elections:
        problems.append(f"vote/position election IDs: {invalid_vote_elections}")
    if invalid_vote_positions:
        problems.append(f"vote/candidate position IDs: {invalid_vote_positions}")
    if invalid_vote_candidate_elections:
        problems.append(
            f"vote/candidate student election IDs: {invalid_vote_candidate_elections}"
        )

    if problems:
        raise RuntimeError(
            "Historical voting integrity validation failed. No deletion-protection "
            "changes were applied. Resolve these records before retrying: "
            + "; ".join(problems)
        )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0010_alter_candidate_photo_url"),
    ]

    operations = [
        migrations.RunPython(
            validate_vote_relationships,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="vote",
            name="election",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                to="core.election",
            ),
        ),
        migrations.AlterField(
            model_name="vote",
            name="position",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                to="core.position",
            ),
        ),
        migrations.AlterField(
            model_name="vote",
            name="candidate",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                to="core.candidate",
            ),
        ),
    ]
