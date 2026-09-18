from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0011_protect_historical_votes"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="assigned_election",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="assigned_users",
                to="core.election",
            ),
        ),
    ]
