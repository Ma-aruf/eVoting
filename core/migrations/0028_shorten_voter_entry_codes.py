import secrets

from django.db import migrations, models

from core.models import generate_voter_entry_code


CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"


def generate_code():
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))


def regenerate_voter_entry_codes(apps, schema_editor):
    Election = apps.get_model("core", "Election")
    used_codes = set()

    for election in Election.objects.all().iterator():
        code = generate_code()
        while code in used_codes:
            code = generate_code()
        election.voter_entry_code = code
        election.save(update_fields=["voter_entry_code"])
        used_codes.add(code)


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0027_election_voter_entry_code"),
    ]

    operations = [
        migrations.RunPython(regenerate_voter_entry_codes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="election",
            name="voter_entry_code",
            field=models.CharField(
                default=generate_voter_entry_code,
                editable=False,
                max_length=6,
                unique=True,
            ),
        ),
    ]
