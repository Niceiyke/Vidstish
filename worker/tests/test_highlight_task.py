import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from worker.tasks import highlight


class TestGenerateHighlight(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.download_root = Path(self.temp_dir.name) / "downloads"
        self.trim_root = Path(self.temp_dir.name) / "trimmed"
        self.merge_root = Path(self.temp_dir.name) / "merged"
        self.highlight_root = Path(self.temp_dir.name) / "highlights"
        for root in [self.download_root, self.trim_root, self.merge_root]:
            (root / "abc123").mkdir(parents=True, exist_ok=True)
        self.merged_file = self.merge_root / "abc123" / "merged.mp4"
        self.merged_file.write_bytes(b"video-bytes")

        self.env_patch = mock.patch.dict(
            os.environ,
            {
                "DOWNLOAD_ROOT": str(self.download_root),
                "TRIM_ROOT": str(self.trim_root),
                "MERGE_ROOT": str(self.merge_root),
                "HIGHLIGHT_ROOT": str(self.highlight_root),
                "MEDIA_BUCKET": "test-bucket",
            },
        )
        self.env_patch.start()
        self.watermark_patch = mock.patch("worker.tasks.highlight._apply_watermark", side_effect=lambda path: Path(path))
        self.watermark_mock = self.watermark_patch.start()

    def tearDown(self):
        self.watermark_patch.stop()
        self.env_patch.stop()
        self.temp_dir.cleanup()

    def test_stages_and_cleans_up_without_upload(self):
        output = highlight.generate_highlight("abc123", str(self.merged_file))

        expected_path = self.highlight_root / "abc123" / "abc123_highlight.mp4"
        self.assertTrue(expected_path.exists())
        self.assertEqual(output, str(expected_path))
        self.assertFalse((self.download_root / "abc123").exists())
        self.assertFalse((self.trim_root / "abc123").exists())
        self.assertFalse((self.merge_root / "abc123").exists())

    def test_applies_watermark_before_upload(self):
        output = highlight.generate_highlight("abc123", str(self.merged_file))

        self.watermark_mock.assert_called_once()
        called_path = Path(self.watermark_mock.call_args.args[0])
        self.assertEqual(called_path, self.highlight_root / "abc123" / "abc123_highlight.mp4")
        self.assertEqual(output, str(called_path))

    def test_uploads_and_updates_supabase(self):
        storage_bucket = mock.MagicMock()
        storage_bucket.get_public_url.return_value = "https://example.com/highlight.mp4"
        table_update = mock.MagicMock()
        table_update.eq.return_value.execute.return_value = {"data": [{"id": "job-1"}]}

        supabase_client = mock.MagicMock()
        supabase_client.storage.from_.return_value = storage_bucket
        supabase_client.table.return_value = table_update

        output = highlight.generate_highlight(
            "abc123", str(self.merged_file), job_id="job-1", supabase_client=supabase_client
        )

        storage_bucket.upload.assert_called_once()
        storage_bucket.get_public_url.assert_called_once()
        supabase_client.table.assert_called_with("clip_jobs")
        table_update.update.assert_called_with({"output_url": "https://example.com/highlight.mp4"})
        table_update.update.return_value.eq.assert_called_with("id", "job-1")
        self.assertEqual(output, "https://example.com/highlight.mp4")


if __name__ == "__main__":
    unittest.main()
