from datetime import timedelta

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


class ElectionEnablementRenameMigrationTests(TransactionTestCase):
    migrate_from = [("core", "0014_alter_user_options_alter_user_managers")]
    migrate_to = [("core", "0015_rename_is_active_election_voting_enabled")]

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        old_apps = executor.loader.project_state(self.migrate_from).apps
        OldElection = old_apps.get_model("core", "Election")
        now = timezone.now()
        OldElection.objects.create(
            name="Legacy enabled", year=2025,
            start_time=now, end_time=now + timedelta(hours=1), is_active=True,
        )
        OldElection.objects.create(
            name="Legacy disabled", year=2025,
            start_time=now, end_time=now + timedelta(hours=1), is_active=False,
        )

        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_to)
        new_apps = executor.loader.project_state(self.migrate_to).apps
        NewElection = new_apps.get_model("core", "Election")
        self.migrated_values = dict(
            NewElection.objects.values_list("name", "voting_enabled")
        )

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def test_existing_manual_switch_values_are_preserved(self):
        self.assertEqual(self.migrated_values["Legacy enabled"], True)
        self.assertEqual(self.migrated_values["Legacy disabled"], False)
