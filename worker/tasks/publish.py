import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict

import httpx

from worker.app import celery_app
from worker.db import get_supabase_client

TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status"


def _token_expired(expires_at: str | None) -> bool:
    if not expires_at:
        return False
    try:
        expiry = datetime.fromisoformat(expires_at)
    except ValueError:
        return False
    return expiry <= datetime.now(timezone.utc) + timedelta(seconds=30)


def _refresh_access_token(client_id: str, client_secret: str, refresh_token: str) -> Dict[str, Any]:
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    response = httpx.post(TOKEN_ENDPOINT, data=payload, timeout=10)
    response.raise_for_status()
    token_payload = response.json()
    expires_in = int(token_payload.get("expires_in", 3600))
    token_payload["expires_at"] = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()
    token_payload["refresh_token"] = token_payload.get("refresh_token", refresh_token)
    return token_payload


def _initiate_resumable_upload(access_token: str, metadata: Dict[str, Any]) -> str:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "X-Upload-Content-Type": "video/mp4",
    }
    tags = metadata.get("tags", [])
    if metadata.get("shorts_mode"):
        lowered = [tag.lower() for tag in tags]
        if "shorts" not in lowered and "#shorts" not in lowered:
            tags = [*tags, "shorts"]

    body = {
        "snippet": {
            "title": metadata.get("title", ""),
            "description": metadata.get("description", ""),
            "tags": tags,
        },
        "status": {"privacyStatus": metadata.get("privacy_status", "unlisted")},
    }
    response = httpx.post(UPLOAD_ENDPOINT, headers=headers, json=body, timeout=10)
    response.raise_for_status()
    upload_url = response.headers.get("Location")
    if not upload_url:
        raise RuntimeError("YouTube API did not return a resumable upload URL")
    return upload_url


def _upload_video(upload_url: str, file_path: Path, access_token: str) -> Dict[str, Any]:
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "video/mp4"}
    with open(file_path, "rb") as handle:
        response = httpx.put(upload_url, headers=headers, content=handle, timeout=None)
    response.raise_for_status()
    return response.json() if response.content else {}


def _persist_publish_results(client: Any, user_id: str, job_id: str | None, tokens: Dict[str, Any], video_id: str | None) -> None:
    if tokens:
        client.table("youtube_tokens").upsert(
            {
                "user_id": user_id,
                "access_token": tokens.get("access_token"),
                "refresh_token": tokens.get("refresh_token"),
                "expires_at": tokens.get("expires_at"),
            },
            on_conflict="user_id",
        ).execute()

    if job_id and video_id:
        client.table("clip_jobs").update({"youtube_url": f"https://youtu.be/{video_id}"}).eq("id", job_id).execute()


@celery_app.task(name="videos.publish_to_youtube")
def publish_to_youtube(
    youtube_id: str,
    file_path: str,
    metadata: Dict[str, Any],
    tokens: Dict[str, Any],
    user_id: str,
    job_id: str | None = None,
    client_id: str | None = None,
    client_secret: str | None = None,
    redirect_uri: str | None = None,
    supabase_client: Any | None = None,
    shorts_mode: bool = False,
) -> Dict[str, Any]:
    source = Path(file_path)
    if not source.exists():
        raise FileNotFoundError(f"Highlight file missing at {file_path}")

    resolved_client = supabase_client
    if resolved_client is None and os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_KEY"):
        resolved_client = get_supabase_client()

    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_at = tokens.get("expires_at")

    active_token = tokens
    if _token_expired(expires_at) and client_id and client_secret and refresh_token:
        refreshed = _refresh_access_token(client_id, client_secret, refresh_token)
        refreshed.setdefault("refresh_token", refresh_token)
        active_token = {**tokens, **refreshed}

    metadata.setdefault("shorts_mode", shorts_mode)
    upload_url = _initiate_resumable_upload(active_token.get("access_token", ""), metadata)
    upload_response = _upload_video(upload_url, source, active_token.get("access_token", ""))
    video_id = upload_response.get("id")

    if resolved_client is not None:
        _persist_publish_results(resolved_client, user_id, job_id, active_token, video_id)

    return {"video_id": video_id, "upload_url": upload_url}
