from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0023_student_voter_activation_expires_at"),
    ]

    operations = [
        migrations.AlterField(
            model_name="election",
            name="voter_login_mode",
            field=models.CharField(
                choices=[
                    ("activator_id", "Activator and student ID"),
                    ("activator_pin", "Activator and PIN"),
                    ("sms_pin", "SMS PIN"),
                ],
                default="activator_pin",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="student",
            name="phone_number",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.CreateModel(
            name="VoterSMSAttempt",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("provider", models.CharField(max_length=50)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("sent", "Sent"),
                            ("failed", "Failed"),
                            ("disabled", "Disabled"),
                        ],
                        db_index=True,
                        max_length=20,
                    ),
                ),
                (
                    "provider_message_id",
                    models.CharField(blank=True, max_length=255),
                ),
                ("error_category", models.CharField(blank=True, max_length=100)),
                (
                    "http_status",
                    models.PositiveSmallIntegerField(blank=True, null=True),
                ),
                (
                    "attempted_at",
                    models.DateTimeField(auto_now_add=True, db_index=True),
                ),
                (
                    "election",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="voter_sms_attempts",
                        to="core.election",
                    ),
                ),
                (
                    "student",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="sms_attempts",
                        to="core.student",
                    ),
                ),
            ],
            options={"ordering": ("-attempted_at",)},
        ),
    ]
