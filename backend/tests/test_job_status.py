import os
import unittest

from fastapi.testclient import TestClient

from backend.app.main import (
    TransitionType,
    app,
    get_clip_job_repository,
    get_video_repository,
)


class FakeClipJobRepository:
    def __init__(self, return_job: bool = True):
        self.return_job = return_job

    def get_job_with_segments(self, job_id: str):
        if not self.return_job or job_id != "job-123":
            return {}
        return {
            "job": {
                "id": job_id,
                "video_id": "video-uuid",
                "transition": TransitionType.FADE.value,
                "output_url": "https://cdn.example.com/highlight.mp4",
            },
            "segments": [
                {"id": "seg-1", "start_seconds": 5, "end_seconds": 15, "position": 0},
                {"id": "seg-2", "start_seconds": 25, "end_seconds": 35, "position": 1},
            ],
        }


class FakeVideoRepository:
    def __init__(self, return_video: bool = True):
        self.return_video = return_video

    def get_video_by_id(self, video_id: str):
        if not self.return_video or video_id != "video-uuid":
            return None
        return {
            "id": "video-uuid",
            "user_id": "user-1",
            "youtube_id": "abc123def45",
            "duration_seconds": 120,
        }


class TestJobStatus(unittest.TestCase):
    def setUp(self):
        os.environ.setdefault("YOUTUBE_API_KEY", "test-key")
        app.dependency_overrides[get_clip_job_repository] = lambda: FakeClipJobRepository(return_job=True)
        app.dependency_overrides[get_video_repository] = lambda: FakeVideoRepository(return_video=True)
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides = {}

    def test_returns_job_status_with_segments(self):
        response = self.client.get("/job/job-123")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["job_id"], "job-123")
        self.assertEqual(payload["youtube_id"], "abc123def45")
        self.assertEqual(payload["transition"], TransitionType.FADE.value)
        self.assertEqual(payload["duration_seconds"], 120)
        self.assertEqual(payload["preview_url"], "https://cdn.example.com/highlight.mp4")
        self.assertEqual(len(payload["segments"]), 2)
        self.assertEqual(payload["segments"][0]["position"], 0)

    def test_returns_404_for_missing_job(self):
        app.dependency_overrides[get_clip_job_repository] = lambda: FakeClipJobRepository(return_job=False)
        response = self.client.get("/job/unknown-job")
        self.assertEqual(response.status_code, 404)
        self.assertIn("Clip job not found", response.json().get("detail", ""))


if __name__ == "__main__":
    unittest.main()
