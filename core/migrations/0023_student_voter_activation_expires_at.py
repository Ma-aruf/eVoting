from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0022_election_voter_login_mode"),
    ]

    operations = [
        migrations.AddField(
            model_name="student",
            name="voter_activation_expires_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
