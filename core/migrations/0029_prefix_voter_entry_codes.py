import secrets

from django.db import migrations


CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"
CODE_PREFIXES = {
    "activator_id": "id",
    "activator_pin": "pn",
    "sms_pin": "sm",
}


def generate_code(login_mode):
    prefix = CODE_PREFIXES.get(login_mode, "pn")
    suffix = "".join(secrets.choice(CODE_ALPHABET) for _ in range(4))
    return prefix + suffix


def prefix_voter_entry_codes(apps, schema_editor):
    Election = apps.get_model("core", "Election")
    used_codes = set()

    for election in Election.objects.all().iterator():
        code = generate_code(election.voter_login_mode)
        while code in used_codes:
            code = generate_code(election.voter_login_mode)
        election.voter_entry_code = code
        election.save(update_fields=["voter_entry_code"])
        used_codes.add(code)


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0028_shorten_voter_entry_codes"),
    ]

    operations = [
        migrations.RunPython(prefix_voter_entry_codes, migrations.RunPython.noop),
    ]
