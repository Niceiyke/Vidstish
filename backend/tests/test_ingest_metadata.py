import os
import unittest
from typing import Any, Dict

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app.main import app, get_video_repository, get_youtube_client


class FakeVideoRepository:
    def __init__(self):
        self.saved_records = []

    def save_metadata(self, record):
        self.saved_records.append(record)
        return record.to_row()


class FakeYouTubeClient:
    def __init__(self, response: Dict[str, Any]):
        self.response = response
        self.requested_ids = []

    async def fetch_metadata(self, video_id: str) -> Dict[str, Any]:
        self.requested_ids.append(video_id)
        return self.response


class TestIngestMetadata(unittest.TestCase):
    def setUp(self):
        os.environ.setdefault("YOUTUBE_API_KEY", "test-key")
        self.client = TestClient(app)
        self.fake_repository = FakeVideoRepository()
        app.dependency_overrides[get_video_repository] = lambda: self.fake_repository

    def tearDown(self):
        app.dependency_overrides = {}

    def test_rejects_invalid_url(self):
        app.dependency_overrides[get_youtube_client] = lambda: FakeYouTubeClient(response={})
        response = self.client.post(
            "/ingest", json={"url": "https://example.com/video", "user_id": "123e4567-e89b-12d3-a456-426614174000"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid YouTube URL", response.json().get("detail", ""))

    def test_ingest_returns_metadata(self):
        fake = FakeYouTubeClient(
            response={
                "video_id": "abc123def45",
                "title": "Test Title",
                "description": "Description here",
                "duration_seconds": 125,
                "thumbnails": {
                    "default": {
                        "url": "https://i.ytimg.com/vi/abc123def45/default.jpg",
                        "width": 120,
                        "height": 90,
                    }
                },
                "captions_available": True,
            }
        )

        app.dependency_overrides[get_youtube_client] = lambda: fake

        response = self.client.post(
            "/ingest",
            json={"url": "https://youtu.be/abc123def45", "user_id": "123e4567-e89b-12d3-a456-426614174000"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["video_id"], "abc123def45")
        self.assertTrue(data["captions_available"])
        self.assertEqual(fake.requested_ids, ["abc123def45"])
        self.assertEqual(len(self.fake_repository.saved_records), 1)
        saved = self.fake_repository.saved_records[0]
        self.assertEqual(saved.user_id, "123e4567-e89b-12d3-a456-426614174000")
        self.assertEqual(saved.youtube_id, "abc123def45")
        self.assertEqual(saved.metadata_json["description"], "Description here")

    def test_missing_video_returns_404(self):
        class MissingClient(FakeYouTubeClient):
            async def fetch_metadata(self, video_id: str) -> Dict[str, Any]:
                raise HTTPException(status_code=404, detail="Video not found")

        fake = MissingClient(response={})
        app.dependency_overrides[get_youtube_client] = lambda: fake

        response = self.client.post(
            "/ingest",
            json={"url": "https://www.youtube.com/watch?v=xyz98765432", "user_id": "123e4567-e89b-12d3-a456-426614174000"},
        )
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
