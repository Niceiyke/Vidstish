import os
import tempfile
import unittest
from datetime import datetime, timezone
from unittest import mock

from fastapi.testclient import TestClient

from backend.app.main import (
    app,
    get_clip_job_repository,
    get_publish_queue,
    get_token_repository,
    get_video_repository,
)


class FakeTokenRepository:
    def __init__(self):
        self.tokens = {}

    def save_tokens(self, record):
        self.tokens[record.user_id] = record.to_row()
        return record.to_row()

    def get_tokens_for_user(self, user_id: str):
        return self.tokens.get(user_id)


class FakeClipJobRepository:
    def __init__(self, highlight_path: str, highlight_count: int = 0, segments: list[dict] | None = None):
        self.highlight_path = highlight_path
        self.highlight_count = highlight_count
        self.segments = segments or [
            {"start_seconds": 0, "end_seconds": 30, "position": 0},
            {"start_seconds": 30, "end_seconds": 55, "position": 1},
        ]

    def get_job_by_id(self, job_id: str):
        if job_id != "job-1":
            return None
        return {
            "id": job_id,
            "user_id": "user-1",
            "video_id": "video-1",
            "output_url": self.highlight_path,
        }

    def count_highlights_for_range(self, user_id, start, end):  # noqa: ANN001
        return self.highlight_count

    def get_segments_for_job(self, job_id: str):
        return self.segments


class FakeVideoRepository:
    def get_video_by_id(self, video_id: str):
        if video_id != "video-1":
            return None
        return {"id": video_id, "youtube_id": "abc123def45", "duration_seconds": 120}


class FakePublishQueue:
    def __init__(self):
        self.called_with = None

    def enqueue_publish(self, **kwargs):
        self.called_with = kwargs
        return "task-123"


class TestPublishFlow(unittest.TestCase):
    def setUp(self):
        os.environ.setdefault("YOUTUBE_CLIENT_ID", "client")
        os.environ.setdefault("YOUTUBE_CLIENT_SECRET", "secret")
        os.environ.setdefault("YOUTUBE_REDIRECT_URI", "https://example.com/callback")
        self.token_repo = FakeTokenRepository()
        self.queue = FakePublishQueue()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.highlight_path = os.path.join(self.temp_dir.name, "highlight.mp4")
        with open(self.highlight_path, "wb") as handle:
            handle.write(b"video-bytes")

        app.dependency_overrides[get_token_repository] = lambda: self.token_repo
        app.dependency_overrides[get_publish_queue] = lambda: self.queue
        app.dependency_overrides[get_clip_job_repository] = lambda: FakeClipJobRepository(self.highlight_path)
        app.dependency_overrides[get_video_repository] = lambda: FakeVideoRepository()
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides = {}
        self.temp_dir.cleanup()

    def test_auth_url_is_generated(self):
        response = self.client.get("/auth/youtube")
        self.assertEqual(response.status_code, 200)
        self.assertIn("accounts.google.com", response.json()["auth_url"])

    def test_exchange_code_stores_tokens(self):
        token_response = {
            "access_token": "access", "refresh_token": "refresh", "expires_in": 3600
        }

        fake_http_response = mock.Mock()
        fake_http_response.json.return_value = token_response
        fake_http_response.raise_for_status.return_value = None

        with mock.patch("backend.app.main.httpx.post", return_value=fake_http_response):
            response = self.client.post(
                "/auth/youtube/exchange",
                json={"user_id": "user-1", "code": "auth-code"},
            )

        self.assertEqual(response.status_code, 200)
        stored = self.token_repo.get_tokens_for_user("user-1")
        self.assertEqual(stored["access_token"], "access")
        self.assertEqual(stored["refresh_token"], "refresh")
        self.assertIn("expires_at", stored)

    def test_publish_requires_tokens_and_queues_task(self):
        now = datetime.now(timezone.utc)
        self.token_repo.tokens["user-1"] = {
            "user_id": "user-1",
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_at": now.isoformat(),
        }

        response = self.client.post(
            "/publish",
            json={
                "user_id": "user-1",
                "job_id": "job-1",
                "title": "Sunday Highlights",
                "description": "A great sermon",
                "tags": ["faith", "hope"],
                "privacy_status": "unlisted",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "queued")
        self.assertIsNotNone(self.queue.called_with)
        self.assertEqual(self.queue.called_with["user_id"], "user-1")
        self.assertEqual(self.queue.called_with["job_id"], "job-1")
        self.assertEqual(self.queue.called_with["metadata"]["title"], "Sunday Highlights")
        self.assertTrue(self.queue.called_with["file_path"].endswith("highlight.mp4"))

    def test_publish_is_blocked_when_monthly_limit_exceeded(self):
        limited_repo = FakeClipJobRepository(self.highlight_path, highlight_count=2)
        app.dependency_overrides[get_clip_job_repository] = lambda: limited_repo
        self.token_repo.tokens["user-1"] = {
            "user_id": "user-1",
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_at": datetime.now(timezone.utc).isoformat(),
        }

        response = self.client.post(
            "/publish",
            json={
                "user_id": "user-1",
                "job_id": "job-1",
                "title": "Sunday Highlights",
                "description": "A great sermon",
                "tags": ["faith", "hope"],
                "privacy_status": "unlisted",
            },
        )

        self.assertEqual(response.status_code, 402)
        self.assertIn("limit", response.json().get("detail", ""))

    def test_paid_plan_bypasses_monthly_limit(self):
        limited_repo = FakeClipJobRepository(self.highlight_path, highlight_count=3)
        app.dependency_overrides[get_clip_job_repository] = lambda: limited_repo
        self.token_repo.tokens["user-1"] = {
            "user_id": "user-1",
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_at": datetime.now(timezone.utc).isoformat(),
        }

        response = self.client.post(
            "/publish",
            json={
                "user_id": "user-1",
                "job_id": "job-1",
                "title": "Paid Highlight",
                "description": "A great sermon",
                "tags": ["faith", "hope"],
                "privacy_status": "unlisted",
                "plan": "paid",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.queue.called_with["plan"], "paid")

    def test_shorts_mode_rejects_long_segments(self):
        shorts_repo = FakeClipJobRepository(
            self.highlight_path,
            highlight_count=0,
            segments=[
                {"start_seconds": 0, "end_seconds": 45, "position": 0},
                {"start_seconds": 45, "end_seconds": 90, "position": 1},
            ],
        )
        app.dependency_overrides[get_clip_job_repository] = lambda: shorts_repo
        self.token_repo.tokens["user-1"] = {
            "user_id": "user-1",
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_at": datetime.now(timezone.utc).isoformat(),
        }

        response = self.client.post(
            "/publish",
            json={
                "user_id": "user-1",
                "job_id": "job-1",
                "title": "Too Long",
                "description": "A great sermon",
                "tags": ["faith", "hope"],
                "privacy_status": "unlisted",
                "shorts_mode": True,
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Shorts mode", response.json().get("detail", ""))


if __name__ == "__main__":
    unittest.main()
