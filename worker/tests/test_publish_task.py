import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from worker.tasks import publish


class TestPublishTask(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.highlight_path = os.path.join(self.temp_dir.name, "highlight.mp4")
        with open(self.highlight_path, "wb") as handle:
            handle.write(b"video-bytes")

        self.supabase_client = mock.MagicMock()
        table_mock = mock.MagicMock()
        table_mock.upsert.return_value.execute.return_value = {"data": [{"user_id": "user-1"}]}
        table_mock.update.return_value.eq.return_value.execute.return_value = {"data": [{"id": "job-1"}]}
        self.supabase_client.table.return_value = table_mock

    def tearDown(self):
        self.temp_dir.cleanup()

    def _build_response(self, json_body=None, headers=None):
        response = mock.MagicMock()
        response.json.return_value = json_body or {}
        response.headers = headers or {}
        response.content = b"{}" if json_body is not None else b""
        response.raise_for_status.return_value = None
        return response

    def test_refreshes_token_and_uploads_video(self):
        expired = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        tokens = {"access_token": "old", "refresh_token": "refresh", "expires_at": expired}

        def fake_post(url, *args, **kwargs):
            if "oauth2" in url:
                return self._build_response({"access_token": "new", "expires_in": 3600})
            return self._build_response({}, {"Location": "https://upload.example.com/resume"})

        upload_response = self._build_response({"id": "yt123"})

        with mock.patch("worker.tasks.publish.httpx.post", side_effect=fake_post) as post_mock, mock.patch(
            "worker.tasks.publish.httpx.put", return_value=upload_response
        ) as put_mock:
            result = publish.publish_to_youtube(
                youtube_id="abc123def45",
                file_path=self.highlight_path,
                metadata={"title": "Test", "privacy_status": "unlisted", "tags": ["tag"]},
                tokens=tokens,
                user_id="user-1",
                job_id="job-1",
                client_id="client",
                client_secret="secret",
                supabase_client=self.supabase_client,
            )

        self.assertEqual(result["video_id"], "yt123")
        post_mock.assert_called()
        put_mock.assert_called_once()
        self.supabase_client.table.assert_any_call("youtube_tokens")
        self.supabase_client.table.assert_any_call("clip_jobs")

    def test_shorts_mode_adds_tag(self):
        tokens = {"access_token": "token", "refresh_token": "refresh", "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()}

        def fake_post(url, *args, **kwargs):
            if "upload" in url:
                tags = kwargs.get("json", {}).get("snippet", {}).get("tags", [])
                self.assertIn("shorts", tags)
                return self._build_response({}, {"Location": "https://upload.example.com/resume"})
            return self._build_response({"access_token": "token", "expires_in": 3600})

        upload_response = self._build_response({"id": "yt123"})

        with mock.patch("worker.tasks.publish.httpx.post", side_effect=fake_post) as post_mock, mock.patch(
            "worker.tasks.publish.httpx.put", return_value=upload_response
        ) as put_mock:
            publish.publish_to_youtube(
                youtube_id="abc123def45",
                file_path=self.highlight_path,
                metadata={"title": "Test", "privacy_status": "unlisted", "tags": []},
                tokens=tokens,
                user_id="user-1",
                job_id="job-1",
                client_id="client",
                client_secret="secret",
                supabase_client=self.supabase_client,
                shorts_mode=True,
            )

        post_mock.assert_called()
        put_mock.assert_called_once()

    def test_raises_for_missing_file(self):
        with self.assertRaises(FileNotFoundError):
            publish.publish_to_youtube(
                youtube_id="abc123def45",
                file_path=os.path.join(self.temp_dir.name, "missing.mp4"),
                metadata={},
                tokens={},
                user_id="user-1",
            )


if __name__ == "__main__":
    unittest.main()
