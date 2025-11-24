import os
import tempfile
from pathlib import Path
from unittest import TestCase, mock

from worker.tasks import download


class DummyYoutubeDL:
    last_created = None

    def __init__(self, options):
        self.options = options
        self.downloaded_urls = []
        DummyYoutubeDL.last_created = self

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return False

    def download(self, urls):
        self.downloaded_urls.extend(urls)
        output_template = self.options["outtmpl"]
        target_path = Path(str(output_template).replace("%(ext)s", "mp4"))
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text("stub mp4 content")


class TestDownloadTask(TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)

    def test_download_video_writes_mp4_with_merge_format(self):
        youtube_url = "https://youtu.be/abc123def45"
        youtube_id = "abc123def45"

        with mock.patch.dict(os.environ, {"DOWNLOAD_ROOT": self.temp_dir.name}):
            with mock.patch("worker.tasks.download.YoutubeDL", DummyYoutubeDL):
                video_path = download.download_video(youtube_url, youtube_id)

        self.assertTrue(Path(video_path).exists())
        self.assertTrue(video_path.endswith(f"{youtube_id}.mp4"))
        self.assertEqual(DummyYoutubeDL.last_created.options["merge_output_format"], "mp4")
        self.assertIn(youtube_url, DummyYoutubeDL.last_created.downloaded_urls)

    def test_cleanup_video_removes_temp_directory(self):
        youtube_id = "clip987654321"

        with mock.patch.dict(os.environ, {"DOWNLOAD_ROOT": self.temp_dir.name}):
            temp_dir = download.ensure_video_dir(youtube_id)
            Path(temp_dir / "file.mp4").write_text("content")

            result = download.cleanup_video(youtube_id)

        self.assertTrue(result)
        self.assertFalse(Path(temp_dir).exists())
