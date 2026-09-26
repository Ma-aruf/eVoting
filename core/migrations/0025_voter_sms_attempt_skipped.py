from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0024_sms_voter_mode"),
    ]

    operations = [
        migrations.AlterField(
            model_name="votersmsattempt",
            name="status",
            field=models.CharField(
                choices=[
                    ("sent", "Sent"),
                    ("failed", "Failed"),
                    ("disabled", "Disabled"),
                    ("skipped", "Skipped"),
                ],
                db_index=True,
                max_length=20,
            ),
        ),
    ]
