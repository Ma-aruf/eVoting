from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0021_student_voter_session_expires_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="election",
            name="voter_login_mode",
            field=models.CharField(
                choices=[
                    ("activator_id", "Activator and student ID"),
                    ("activator_pin", "Activator and PIN"),
                ],
                default="activator_pin",
                max_length=20,
            ),
        ),
    ]
