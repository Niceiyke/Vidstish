import os
import re
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List

import httpx
from celery import Celery
from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel, ConfigDict, HttpUrl, model_validator

from backend.app.db import get_supabase_client


YOUTUBE_URL_PATTERN = re.compile(
    r"(?:https?://)?(?:www\.|m\.)?(?:youtube\.com/watch\?v=|youtu\.be/)([\w-]{11})"
)


class HealthResponse(BaseModel):
    service: str
    status: str


class TransitionType(str, Enum):
    FADE = "fade"
    FADE_BLACK = "fadeblack"
    CROSSFADE = "crossfade"
    SLIDE = "slide"
    ZOOM = "zoom"
    WIPE = "wipe"
    CUT = "cut"
    AUTO = "auto"


class SubscriptionPlan(str, Enum):
    FREE = "free"
    PAID = "paid"


class IngestRequest(BaseModel):
    url: HttpUrl
    user_id: str


class Thumbnail(BaseModel):
    url: HttpUrl
    width: int | None = None
    height: int | None = None


class IngestResponse(BaseModel):
    video_id: str
    title: str
    description: str
    duration_seconds: int
    thumbnails: Dict[str, Thumbnail]
    captions_available: bool


class VideoRecord(BaseModel):
    user_id: str
    youtube_id: str
    title: str
    duration_seconds: int
    metadata_json: Dict[str, Any]

    def to_row(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "youtube_id": self.youtube_id,
            "title": self.title,
            "duration_seconds": self.duration_seconds,
            "metadata_json": self.metadata_json,
        }


class VideoRepository:
    def __init__(self, client: Any):
        self.client = client

    def save_metadata(self, record: VideoRecord) -> Dict[str, Any]:
        response = self.client.table("videos").insert(record.to_row()).execute()
        data = getattr(response, "data", None)
        if data:
            return data[0]
        if isinstance(response, dict):
            entries = response.get("data") or []
            if entries:
                return entries[0]
        return record.to_row()

    def get_video_by_id(self, video_id: str) -> Dict[str, Any] | None:
        response = self.client.table("videos").select("*").eq("id", video_id).limit(1).execute()
        data = getattr(response, "data", None)
        if not data and isinstance(response, dict):
            data = response.get("data") or []
        return data[0] if data else None

    def get_video_by_user_and_youtube(self, user_id: str, youtube_id: str) -> Dict[str, Any] | None:
        response = (
            self.client.table("videos")
            .select("*")
            .eq("user_id", user_id)
            .eq("youtube_id", youtube_id)
            .limit(1)
            .execute()
        )

        data = getattr(response, "data", None)
        if not data and isinstance(response, dict):
            data = response.get("data") or []
        return data[0] if data else None


class ClipSegment(BaseModel):
    start: float
    end: float
    position: int

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_bounds(self) -> "ClipSegment":
        if self.start < 0 or self.end < 0:
            raise ValueError("start and end must be non-negative")
        if self.end <= self.start:
            raise ValueError("end must be greater than start")
        return self


class ClipSegmentResponse(BaseModel):
    id: str | None = None
    start: float
    end: float
    position: int


class ClipJobRequest(BaseModel):
    user_id: str
    youtube_id: str
    plan: SubscriptionPlan = SubscriptionPlan.FREE
    transition: TransitionType = TransitionType.FADE
    segments: List[ClipSegment]

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_segments(self) -> "ClipJobRequest":
        if not self.segments:
            raise ValueError("At least one segment is required")
        return self


class ClipJobResponse(BaseModel):
    job_id: str
    video_id: str
    transition: TransitionType
    output_url: str | None = None
    segments: List[ClipSegmentResponse]


class ClipJobStatusSegment(BaseModel):
    id: str | None = None
    start: float
    end: float
    position: int


class ClipJobStatusResponse(BaseModel):
    job_id: str
    video_id: str
    youtube_id: str
    transition: TransitionType
    duration_seconds: int
    preview_url: str | None = None
    segments: List[ClipJobStatusSegment]


class YouTubeAuthResponse(BaseModel):
    auth_url: HttpUrl


class YouTubeTokenExchangeRequest(BaseModel):
    user_id: str
    code: str


class YouTubeTokenRecord(BaseModel):
    user_id: str
    access_token: str
    refresh_token: str
    expires_at: datetime

    def to_row(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "expires_at": self.expires_at.isoformat(),
        }


class PublishRequest(BaseModel):
    user_id: str
    job_id: str
    title: str
    description: str | None = None
    tags: List[str] = []
    privacy_status: str = "unlisted"
    plan: SubscriptionPlan = SubscriptionPlan.FREE
    shorts_mode: bool = False

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_privacy(self) -> "PublishRequest":
        allowed_statuses = {"private", "public", "unlisted"}
        if self.privacy_status not in allowed_statuses:
            raise ValueError("privacy_status must be one of private, public, or unlisted")
        self.tags = [tag.strip() for tag in self.tags if tag.strip()]
        return self


class PublishResponse(BaseModel):
    job_id: str
    status: str
    youtube_video_id: str | None = None


class ClipJobRepository:
    def __init__(self, client: Any):
        self.client = client

    def _extract_first(self, response: Any, fallback: Dict[str, Any]) -> Dict[str, Any]:
        data = getattr(response, "data", None)
        if data:
            return data[0]
        if isinstance(response, dict):
            entries = response.get("data") or []
            if entries:
                return entries[0]
        return fallback

    def _extract_list(self, response: Any, fallback: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        data = getattr(response, "data", None)
        if data:
            return data
        if isinstance(response, dict):
            entries = response.get("data")
            if entries:
                return entries
        return fallback

    def create_job_with_segments(
        self,
        user_id: str,
        video_id: str,
        segments: List[ClipSegment],
        transition: TransitionType,
    ) -> Dict[str, Any]:
        job_row = {"user_id": user_id, "video_id": video_id, "transition": transition.value}
        job_response = self.client.table("clip_jobs").insert(job_row).execute()
        job_data = self._extract_first(job_response, job_row)

        segment_rows = [
            {"job_id": job_data.get("id"), "start_seconds": seg.start, "end_seconds": seg.end, "position": seg.position}
            for seg in segments
        ]
        segment_response = self.client.table("clip_segments").insert(segment_rows).execute()
        created_segments = self._extract_list(segment_response, segment_rows)

        return {"job": job_data, "segments": created_segments}

    def get_job_with_segments(self, job_id: str) -> Dict[str, Any]:
        job_response = self.client.table("clip_jobs").select("*").eq("id", job_id).limit(1).execute()
        job_data = self._extract_first(job_response, {})
        if not job_data:
            return {}

        segments_response = (
            self.client.table("clip_segments")
            .select("*")
            .eq("job_id", job_id)
            .order("position")
            .execute()
        )
        segments = self._extract_list(segments_response, [])
        return {"job": job_data, "segments": segments}

    def get_job_by_id(self, job_id: str) -> Dict[str, Any] | None:
        response = self.client.table("clip_jobs").select("*").eq("id", job_id).limit(1).execute()
        return self._extract_first(response, {})

    def count_highlights_for_range(
        self, user_id: str, start_at: datetime, end_at: datetime
    ) -> int:
        response = (
            self.client.table("clip_jobs")
            .select("id, output_url, created_at")
            .eq("user_id", user_id)
            .gte("created_at", start_at.isoformat())
            .lt("created_at", end_at.isoformat())
            .execute()
        )
        entries = self._extract_list(response, [])
        return sum(1 for entry in entries if entry.get("output_url"))

    def get_segments_for_job(self, job_id: str) -> List[Dict[str, Any]]:
        response = (
            self.client.table("clip_segments")
            .select("*")
            .eq("job_id", job_id)
            .order("position")
            .execute()
        )
        return self._extract_list(response, [])


class YouTubeTokenRepository:
    def __init__(self, client: Any):
        self.client = client

    def save_tokens(self, record: YouTubeTokenRecord) -> Dict[str, Any]:
        response = (
            self.client.table("youtube_tokens")
            .upsert(record.to_row(), on_conflict="user_id")
            .execute()
        )
        data = getattr(response, "data", None)
        if data:
            return data[0]
        if isinstance(response, dict):
            entries = response.get("data") or []
            if entries:
                return entries[0]
        return record.to_row()

    def get_tokens_for_user(self, user_id: str) -> Dict[str, Any] | None:
        response = self.client.table("youtube_tokens").select("*").eq("user_id", user_id).limit(1).execute()
        data = getattr(response, "data", None)
        if not data and isinstance(response, dict):
            data = response.get("data") or []
        return data[0] if data else None


class PublishQueue:
    def __init__(self, celery_app: Celery):
        self.celery_app = celery_app

    def enqueue_publish(
        self,
        youtube_id: str,
        file_path: str,
        metadata: Dict[str, Any],
        tokens: Dict[str, Any],
        user_id: str,
        job_id: str | None = None,
        plan: SubscriptionPlan = SubscriptionPlan.FREE,
        shorts_mode: bool = False,
    ) -> str:
        queue_name = os.getenv("PAID_QUEUE_NAME", "priority") if plan == SubscriptionPlan.PAID else None
        priority = 9 if plan == SubscriptionPlan.PAID else 5

        result = self.celery_app.send_task(
            "videos.publish_to_youtube",
            kwargs={
                "youtube_id": youtube_id,
                "file_path": file_path,
                "metadata": metadata,
                "tokens": tokens,
                "user_id": user_id,
                "job_id": job_id,
                "client_id": os.getenv("YOUTUBE_CLIENT_ID"),
                "client_secret": os.getenv("YOUTUBE_CLIENT_SECRET"),
                "redirect_uri": os.getenv("YOUTUBE_REDIRECT_URI"),
                "shorts_mode": shorts_mode,
            },
            queue=queue_name,
            priority=priority,
        )
        return str(getattr(result, "id", ""))


class YouTubeMetadataClient:
    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("YOUTUBE_API_KEY is required to fetch metadata")
        self.api_key = api_key

    async def fetch_metadata(self, video_id: str) -> Dict[str, Any]:
        params = {
            "part": "snippet,contentDetails",
            "id": video_id,
            "key": self.api_key,
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://www.googleapis.com/youtube/v3/videos", params=params, timeout=10
            )
        response.raise_for_status()
        payload = response.json()
        items = payload.get("items", [])
        if not items:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Video not found or inaccessible",
            )
        video = items[0]
        snippet = video.get("snippet", {})
        content_details = video.get("contentDetails", {})

        return {
            "video_id": video_id,
            "title": snippet.get("title", ""),
            "description": snippet.get("description", ""),
            "duration_seconds": iso8601_duration_to_seconds(content_details.get("duration", "PT0S")),
            "thumbnails": snippet.get("thumbnails", {}),
            "captions_available": content_details.get("caption", "false") == "true",
        }


def iso8601_duration_to_seconds(duration: str) -> int:
    match = re.match(
        r"PT(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?", duration
    )
    if not match:
        return 0
    hours = int(match.group("hours") or 0)
    minutes = int(match.group("minutes") or 0)
    seconds = int(match.group("seconds") or 0)
    return hours * 3600 + minutes * 60 + seconds


def extract_video_id(url: str) -> str:
    match = YOUTUBE_URL_PATTERN.match(url)
    if not match:
        raise ValueError("Invalid YouTube URL")
    return match.group(1)


class FreeTierPolicy:
    MAX_HIGHLIGHTS_PER_MONTH = 2
    ALLOWED_TRANSITIONS = {TransitionType.FADE}

    def __init__(self, job_repository: ClipJobRepository):
        self.job_repository = job_repository

    def _current_month_window(self) -> tuple[datetime, datetime]:
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        next_month = (month_start + timedelta(days=32)).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        return month_start, next_month

    def ensure_transition_allowed(self, transition: TransitionType) -> None:
        if transition not in self.ALLOWED_TRANSITIONS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Free tier supports only fade transitions",
            )

    def ensure_highlight_quota(self, user_id: str) -> None:
        month_start, next_month = self._current_month_window()
        highlight_count = self.job_repository.count_highlights_for_range(
            user_id, month_start, next_month
        )

        if highlight_count >= self.MAX_HIGHLIGHTS_PER_MONTH:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Free tier limit reached: 2 highlights per month. Upgrade to continue.",
            )


def build_youtube_auth_url() -> str:
    client_id = os.getenv("YOUTUBE_CLIENT_ID")
    redirect_uri = os.getenv("YOUTUBE_REDIRECT_URI")
    scope = os.getenv(
        "YOUTUBE_UPLOAD_SCOPE",
        "https://www.googleapis.com/auth/youtube.upload",
    )

    if not client_id or not redirect_uri:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="YouTube OAuth credentials are not configured",
        )

    return (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        f"&scope={scope}"
        "&access_type=offline"
        "&prompt=consent"
    )


def exchange_code_for_tokens(code: str) -> Dict[str, Any]:
    client_id = os.getenv("YOUTUBE_CLIENT_ID")
    client_secret = os.getenv("YOUTUBE_CLIENT_SECRET")
    redirect_uri = os.getenv("YOUTUBE_REDIRECT_URI")

    if not client_id or not client_secret or not redirect_uri:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="YouTube OAuth credentials are not configured",
        )

    data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }

    response = httpx.post("https://oauth2.googleapis.com/token", data=data, timeout=10)
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:  # noqa: BLE001 - surface OAuth errors
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to exchange OAuth code for tokens",
        ) from exc

    return response.json()


def resolve_highlight_path(output_url: str | None, youtube_id: str) -> Path | None:
    if output_url:
        candidate = Path(output_url)
        if candidate.exists():
            return candidate

    highlight_root = os.getenv("HIGHLIGHT_ROOT")
    if highlight_root:
        candidate = Path(highlight_root) / youtube_id
        if candidate.exists():
            mp4_files = sorted(candidate.glob("*.mp4"))
            if mp4_files:
                return mp4_files[0]
    return None


def get_youtube_client() -> YouTubeMetadataClient:
    api_key = os.getenv("YOUTUBE_API_KEY", "")
    return YouTubeMetadataClient(api_key=api_key)


def get_video_repository() -> VideoRepository:
    try:
        client = get_supabase_client()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    return VideoRepository(client)


def get_clip_job_repository() -> ClipJobRepository:
    try:
        client = get_supabase_client()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    return ClipJobRepository(client)


def get_token_repository() -> YouTubeTokenRepository:
    try:
        client = get_supabase_client()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    return YouTubeTokenRepository(client)


def get_publish_queue() -> PublishQueue:
    broker_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    backend = os.getenv("CELERY_RESULT_BACKEND", broker_url)
    celery_app = Celery("sermonclipper-api", broker=broker_url, backend=backend)
    return PublishQueue(celery_app)


def create_app() -> FastAPI:
    application = FastAPI(title="SermonClipper API", version="0.1.0")

    @application.get("/health", response_model=HealthResponse, tags=["health"])
    def health() -> HealthResponse:
        return HealthResponse(service="api", status="ok")

    @application.post("/ingest", response_model=IngestResponse, tags=["ingestion"])
    async def ingest(
        payload: IngestRequest,
        client: YouTubeMetadataClient = Depends(get_youtube_client),
        repository: VideoRepository = Depends(get_video_repository),
    ) -> IngestResponse:
        try:
            video_id = extract_video_id(str(payload.url))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc

        try:
            metadata = await client.fetch_metadata(video_id)
        except HTTPException:
            raise
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to fetch metadata from YouTube",
            ) from exc

        record = VideoRecord(
            user_id=payload.user_id,
            youtube_id=video_id,
            title=metadata.get("title", ""),
            duration_seconds=metadata.get("duration_seconds", 0),
            metadata_json={
                "description": metadata.get("description", ""),
                "thumbnails": metadata.get("thumbnails", {}),
                "captions_available": metadata.get("captions_available", False),
            },
        )

        try:
            repository.save_metadata(record)
        except Exception as exc:  # noqa: BLE001 - bubble up storage errors as 502
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to persist metadata to Supabase",
        ) from exc

        return IngestResponse(**metadata)

    @application.get("/auth/youtube", response_model=YouTubeAuthResponse, tags=["publish"])
    async def youtube_auth() -> YouTubeAuthResponse:
        return YouTubeAuthResponse(auth_url=build_youtube_auth_url())

    @application.post(
        "/auth/youtube/exchange", response_model=HealthResponse, tags=["publish"]
    )
    async def youtube_token_exchange(
        payload: YouTubeTokenExchangeRequest,
        repository: YouTubeTokenRepository = Depends(get_token_repository),
    ) -> HealthResponse:
        token_payload = exchange_code_for_tokens(payload.code)
        expires_in = int(token_payload.get("expires_in", 3600))
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        record = YouTubeTokenRecord(
            user_id=payload.user_id,
            access_token=token_payload.get("access_token", ""),
            refresh_token=token_payload.get("refresh_token", ""),
            expires_at=expires_at,
        )
        try:
            repository.save_tokens(record)
        except Exception as exc:  # noqa: BLE001 - surface storage errors
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to persist OAuth tokens",
            ) from exc

        return HealthResponse(service="youtube", status="authorized")

    @application.post("/segments", response_model=ClipJobResponse, tags=["segments"])
    async def save_segments(
        payload: ClipJobRequest,
        video_repository: VideoRepository = Depends(get_video_repository),
        job_repository: ClipJobRepository = Depends(get_clip_job_repository),
    ) -> ClipJobResponse:
        video = video_repository.get_video_by_user_and_youtube(
            user_id=payload.user_id, youtube_id=payload.youtube_id
        )
        if not video:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found for user")

        if payload.plan == SubscriptionPlan.FREE:
            FreeTierPolicy(job_repository).ensure_transition_allowed(payload.transition)

        duration_seconds = int(video.get("duration_seconds", 0))
        for segment in payload.segments:
            if segment.end > duration_seconds:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Segment end exceeds video duration",
                )

        try:
            job = job_repository.create_job_with_segments(
                payload.user_id, video.get("id"), payload.segments, payload.transition
            )
        except Exception as exc:  # noqa: BLE001 - bubble up storage errors as 502
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to persist clip job",
            ) from exc

        response_segments = [
            ClipSegmentResponse(
                id=segment.get("id"),
                start=float(segment.get("start_seconds", 0)),
                end=float(segment.get("end_seconds", 0)),
                position=int(segment.get("position", 0)),
            )
            for segment in job.get("segments", [])
        ]

        return ClipJobResponse(
            job_id=str(job.get("job", {}).get("id")),
            video_id=str(video.get("id")),
            transition=TransitionType(job.get("job", {}).get("transition", TransitionType.AUTO)),
            output_url=job.get("job", {}).get("output_url"),
            segments=response_segments,
        )

    @application.get("/job/{job_id}", response_model=ClipJobStatusResponse, tags=["jobs"])
    async def get_job_status(
        job_id: str,
        job_repository: ClipJobRepository = Depends(get_clip_job_repository),
        video_repository: VideoRepository = Depends(get_video_repository),
    ) -> ClipJobStatusResponse:
        record = job_repository.get_job_with_segments(job_id)
        job = record.get("job") if record else None
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip job not found")

        video = video_repository.get_video_by_id(job.get("video_id"))
        if not video:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found for job")

        response_segments = [
            ClipJobStatusSegment(
                id=segment.get("id"),
                start=float(segment.get("start_seconds", 0)),
                end=float(segment.get("end_seconds", 0)),
                position=int(segment.get("position", 0)),
            )
            for segment in record.get("segments", [])
        ]

        return ClipJobStatusResponse(
            job_id=str(job.get("id")),
            video_id=str(video.get("id")),
            youtube_id=str(video.get("youtube_id")),
            transition=TransitionType(job.get("transition", TransitionType.AUTO)),
            duration_seconds=int(video.get("duration_seconds", 0)),
            preview_url=job.get("output_url"),
            segments=response_segments,
        )

    @application.post("/publish", response_model=PublishResponse, tags=["publish"])
    async def publish_highlight(
        payload: PublishRequest,
        job_repository: ClipJobRepository = Depends(get_clip_job_repository),
        video_repository: VideoRepository = Depends(get_video_repository),
        token_repository: YouTubeTokenRepository = Depends(get_token_repository),
        publish_queue: PublishQueue = Depends(get_publish_queue),
    ) -> PublishResponse:
        job = job_repository.get_job_by_id(payload.job_id)
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip job not found")
        if str(job.get("user_id")) != payload.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not authorized for job")

        if payload.plan == SubscriptionPlan.FREE:
            FreeTierPolicy(job_repository).ensure_highlight_quota(payload.user_id)

        video = video_repository.get_video_by_id(job.get("video_id"))
        if not video:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found for job")

        if payload.shorts_mode:
            max_duration = int(os.getenv("SHORTS_MAX_DURATION", "60"))
            segments = job_repository.get_segments_for_job(payload.job_id)
            total_duration = sum(
                float(segment.get("end_seconds", 0)) - float(segment.get("start_seconds", 0))
                for segment in segments
            )
            if total_duration > max_duration:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Shorts mode requires <= {max_duration} seconds of clips",
                )

        highlight_path = resolve_highlight_path(job.get("output_url"), video.get("youtube_id", ""))
        if highlight_path is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Highlight file not available for upload",
            )

        tokens = token_repository.get_tokens_for_user(payload.user_id)
        if not tokens:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="YouTube authorization is required before publishing",
            )

        tags = payload.tags
        if payload.shorts_mode:
            tag_values = [tag.lower() for tag in tags]
            if "shorts" not in tag_values and "#shorts" not in tag_values:
                tags = [*tags, "shorts"]

        metadata = {
            "title": payload.title,
            "description": payload.description or "",
            "tags": tags,
            "privacy_status": payload.privacy_status,
            "shorts_mode": payload.shorts_mode,
        }

        try:
            publish_queue.enqueue_publish(
                youtube_id=video.get("youtube_id", ""),
                file_path=str(highlight_path),
                metadata=metadata,
                tokens=tokens,
                user_id=payload.user_id,
                job_id=payload.job_id,
                plan=payload.plan,
                shorts_mode=payload.shorts_mode,
            )
        except Exception as exc:  # noqa: BLE001 - propagate queue errors as 502
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to queue YouTube upload",
            ) from exc

        return PublishResponse(job_id=payload.job_id, status="queued")

    return application


app = create_app()
