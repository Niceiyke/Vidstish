import os
import unittest
from typing import Any, Dict, List

from fastapi.testclient import TestClient

from backend.app.main import (
    ClipSegment,
    TransitionType,
    app,
    get_clip_job_repository,
    get_video_repository,
)


class FakeVideoRepository:
    def __init__(self, video: Dict[str, Any] | None):
        self.video = video

    def get_video_by_user_and_youtube(self, user_id: str, youtube_id: str) -> Dict[str, Any] | None:
        if not self.video:
            return None
        if self.video["user_id"] == user_id and self.video["youtube_id"] == youtube_id:
            return self.video
        return None


class FakeClipJobRepository:
    def __init__(self):
        self.saved_jobs: List[Dict[str, Any]] = []

    def create_job_with_segments(
        self, user_id: str, video_id: str, segments: List[ClipSegment], transition: TransitionType
    ) -> Dict[str, Any]:
        job = {"id": "job-123", "user_id": user_id, "video_id": video_id, "transition": transition.value}
        segment_rows = [
            {"id": f"seg-{idx}", "job_id": job["id"], "start_seconds": seg.start, "end_seconds": seg.end, "position": seg.position}
            for idx, seg in enumerate(segments)
        ]
        self.saved_jobs.append({"job": job, "segments": segment_rows})
        return {"job": job, "segments": segment_rows}


class TestClipSegments(unittest.TestCase):
    def setUp(self):
        os.environ.setdefault("YOUTUBE_API_KEY", "test-key")
        self.client = TestClient(app)
        self.fake_repo = FakeClipJobRepository()
        video_record = {
            "id": "video-uuid",
            "user_id": "user-1",
            "youtube_id": "abc123def45",
            "duration_seconds": 120,
        }
        app.dependency_overrides[get_clip_job_repository] = lambda: self.fake_repo
        app.dependency_overrides[get_video_repository] = lambda: FakeVideoRepository(video_record)

    def tearDown(self):
        app.dependency_overrides = {}

    def test_rejects_segment_outside_duration(self):
        response = self.client.post(
            "/segments",
            json={
                "user_id": "user-1",
                "youtube_id": "abc123def45",
                "transition": "fade",
                "segments": [
                    {"start": 10, "end": 130, "position": 0}
                ],
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("exceeds video duration", response.json().get("detail", ""))

    def test_rejects_invalid_segment_bounds(self):
        response = self.client.post(
            "/segments",
            json={
                "user_id": "user-1",
                "youtube_id": "abc123def45",
                "transition": "fade",
                "segments": [
                    {"start": 50, "end": 20, "position": 0}
                ],
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_rejects_non_fade_transition_for_free_tier(self):
        response = self.client.post(
            "/segments",
            json={
                "user_id": "user-1",
                "youtube_id": "abc123def45",
                "transition": "crossfade",
                "segments": [
                    {"start": 10, "end": 20, "position": 0},
                ],
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("only fade", response.json().get("detail", ""))

    def test_allows_paid_transition_variants(self):
        response = self.client.post(
            "/segments",
            json={
                "user_id": "user-1",
                "youtube_id": "abc123def45",
                "plan": "paid",
                "transition": "crossfade",
                "segments": [
                    {"start": 10, "end": 20, "position": 0},
                ],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.fake_repo.saved_jobs[0]["job"].get("transition"), TransitionType.CROSSFADE.value
        )

    def test_creates_clip_job(self):
        response = self.client.post(
            "/segments",
            json={
                "user_id": "user-1",
                "youtube_id": "abc123def45",
                "transition": "fade",
                "segments": [
                    {"start": 10, "end": 20, "position": 0},
                    {"start": 30, "end": 50, "position": 1},
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["job_id"], "job-123")
        self.assertEqual(len(data["segments"]), 2)
        self.assertEqual(self.fake_repo.saved_jobs[0]["job"]["video_id"], "video-uuid")
        self.assertEqual(self.fake_repo.saved_jobs[0]["job"].get("transition"), TransitionType.FADE.value)


if __name__ == "__main__":
    unittest.main()
