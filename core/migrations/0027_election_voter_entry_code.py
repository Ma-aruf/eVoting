import secrets

from django.db import migrations, models

from core.models import generate_voter_entry_code


CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"


def generate_code():
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def backfill_voter_entry_codes(apps, schema_editor):
    Election = apps.get_model("core", "Election")
    used_codes = set(
        Election.objects.exclude(voter_entry_code__isnull=True)
        .values_list("voter_entry_code", flat=True)
    )

    for election in Election.objects.filter(voter_entry_code__isnull=True).iterator():
        code = generate_code()
        while code in used_codes:
            code = generate_code()
        election.voter_entry_code = code
        election.save(update_fields=["voter_entry_code"])
        used_codes.add(code)


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="election",
            name="voter_entry_code",
            field=models.CharField(
                editable=False,
                max_length=8,
                null=True,
                unique=True,
            ),
        ),
        migrations.RunPython(backfill_voter_entry_codes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="election",
            name="voter_entry_code",
            field=models.CharField(
                default=generate_voter_entry_code,
                editable=False,
                max_length=8,
                unique=True,
            ),
        ),
    ]
