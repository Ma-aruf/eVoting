from django.db import connection
from django.db.migrations.loader import MigrationLoader
from django.test import TestCase


class ElectionMigrationStateTests(TestCase):
    def test_current_migration_state_uses_voting_enabled(self):
        loader = MigrationLoader(connection)
        state = loader.project_state(loader.graph.leaf_nodes("core"))
        election = state.apps.get_model("core", "Election")
        fields = {field.name for field in election._meta.get_fields()}

        self.assertIn("voting_enabled", fields)
        self.assertNotIn("is_active", fields)
