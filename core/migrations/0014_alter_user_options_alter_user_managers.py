import core.models
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0013_enforce_user_election_assignment"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="user",
            options={},
        ),
        migrations.AlterModelManagers(
            name="user",
            managers=[
                ("objects", core.models.UserManager()),
            ],
        ),
    ]
