import unittest
from pathlib import Path


class TestProjectScaffold(unittest.TestCase):
    def setUp(self):
        self.project_root = Path(__file__).resolve().parents[2]

    def test_core_directories_exist(self):
        for name in ["backend", "frontend", "worker"]:
            with self.subTest(name=name):
                self.assertTrue((self.project_root / name).is_dir(), f"{name} directory should exist")

    def test_env_example_has_required_keys(self):
        env_path = self.project_root / ".env.example"
        self.assertTrue(env_path.is_file(), ".env.example should be present at project root")

        expected_keys = {
            "API_HOST",
            "API_PORT",
            "SUPABASE_URL",
            "SUPABASE_SERVICE_KEY",
            "REDIS_URL",
            "CELERY_RESULT_BACKEND",
            "PAID_QUEUE_NAME",
            "DOWNLOAD_ROOT",
            "YOUTUBE_API_KEY",
            "YOUTUBE_CLIENT_ID",
            "YOUTUBE_CLIENT_SECRET",
            "YOUTUBE_REDIRECT_URI",
            "YOUTUBE_UPLOAD_SCOPE",
            "SHORTS_MAX_DURATION",
            "MEDIA_BUCKET",
            "FRONTEND_PORT",
            "NEXT_PUBLIC_API_BASE_URL",
            "MERGE_ROOT",
            "HIGHLIGHT_ROOT",
            "WATERMARK_PATH",
            "WATERMARK_TEXT",
            "WATERMARK_POSITION",
            "WATERMARK_MARGIN",
        }

        content = env_path.read_text().splitlines()
        present_keys = {line.split("=", 1)[0] for line in content if line and not line.startswith("#")}
        self.assertTrue(expected_keys.issubset(present_keys), "Missing expected environment keys in .env.example")

    def test_supabase_migration_exists(self):
        videos_migration = self.project_root / "backend" / "supabase" / "migrations" / "0001_create_videos_table.sql"
        clip_migration = self.project_root / "backend" / "supabase" / "migrations" / "0002_create_clip_tables.sql"
        trimmed_path_migration = (
            self.project_root / "backend" / "supabase" / "migrations" / "0003_add_trimmed_path_to_segments.sql"
        )
        transition_migration = (
            self.project_root / "backend" / "supabase" / "migrations" / "0004_add_transition_to_clip_jobs.sql"
        )
        output_url_migration = (
            self.project_root / "backend" / "supabase" / "migrations" / "0005_add_output_url_to_clip_jobs.sql"
        )
        tokens_migration = (
            self.project_root / "backend" / "supabase" / "migrations" / "0006_create_youtube_tokens.sql"
        )
        youtube_url_migration = (
            self.project_root / "backend" / "supabase" / "migrations" / "0007_add_youtube_url_to_clip_jobs.sql"
        )
        self.assertTrue(videos_migration.is_file(), "Supabase migration for videos table should exist")
        self.assertTrue(clip_migration.is_file(), "Supabase migration for clip tables should exist")
        self.assertTrue(trimmed_path_migration.is_file(), "Supabase migration for segment trimmed paths should exist")
        self.assertTrue(transition_migration.is_file(), "Supabase migration for clip job transitions should exist")
        self.assertTrue(output_url_migration.is_file(), "Supabase migration for clip job output URLs should exist")
        self.assertTrue(tokens_migration.is_file(), "Supabase migration for YouTube tokens should exist")
        self.assertTrue(youtube_url_migration.is_file(), "Supabase migration for published YouTube URLs should exist")

        text = videos_migration.read_text()
        for column in ["user_id", "youtube_id", "duration_seconds", "metadata_json"]:
            with self.subTest(column=column):
                self.assertIn(column, text)

        clip_text = clip_migration.read_text()
        for token in ["clip_jobs", "clip_segments", "start_seconds", "end_seconds", "position"]:
            with self.subTest(token=token):
                self.assertIn(token, clip_text)

        trim_text = trimmed_path_migration.read_text()
        self.assertIn("trimmed_path", trim_text)

        transition_text = transition_migration.read_text()
        self.assertIn("transition", transition_text)


if __name__ == "__main__":
    unittest.main()
