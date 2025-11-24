import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from worker.app import celery_app
from worker.db import get_supabase_client
from worker.tasks.download import get_download_root
from worker.tasks.trim import get_trim_root
from worker.tasks.transitions import get_merge_root


def _apply_watermark(video_path: Path) -> Path:
    watermark_image = os.getenv("WATERMARK_PATH")
    watermark_position = os.getenv("WATERMARK_POSITION", "top-right").lower()
    watermark_text = os.getenv("WATERMARK_TEXT", "SermonClipper")
    margin = int(os.getenv("WATERMARK_MARGIN", "12"))

    positions = {
        "top-left": (f"{margin}", f"{margin}"),
        "top-right": (f"W-w-{margin}", f"{margin}"),
        "bottom-left": (f"{margin}", f"H-h-{margin}"),
        "bottom-right": (f"W-w-{margin}", f"H-h-{margin}"),
    }
    x_expr, y_expr = positions.get(watermark_position, positions["top-right"])

    output_path = video_path.with_name(f"{video_path.stem}_watermarked{video_path.suffix}")

    if watermark_image:
        command = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-i",
            watermark_image,
            "-filter_complex",
            f"overlay={x_expr}:{y_expr}",
            "-codec:a",
            "copy",
            str(output_path),
        ]
    else:
        text_filter = (
            f"drawtext=text='{watermark_text}':fontcolor=white@0.85:fontsize=24:box=1:boxcolor=black@0.35:boxborderw=6:"
            f"x={x_expr}:y={y_expr}"
        )
        command = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-vf",
            text_filter,
            "-codec:a",
            "copy",
            str(output_path),
        ]

    subprocess.run(command, check=True, capture_output=True)
    video_path.unlink(missing_ok=True)
    return output_path


def get_highlight_root() -> Path:
    return Path(os.getenv("HIGHLIGHT_ROOT", "/tmp/sermonclipper/highlights"))


def stage_highlight(merged_path: str, youtube_id: str, job_id: str | None = None) -> Path:
    merged_file = Path(merged_path)
    if not merged_file.exists():
        raise FileNotFoundError(f"Merged video not found at {merged_path}")

    target_dir = get_highlight_root() / youtube_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{job_id or youtube_id}_highlight.mp4"
    shutil.copy2(merged_file, target_path)
    return target_path


def _cleanup_intermediate_assets(youtube_id: str) -> None:
    for root in [get_download_root(), get_trim_root(), get_merge_root()]:
        candidate = root / youtube_id
        if candidate.exists():
            shutil.rmtree(candidate, ignore_errors=True)


def _upload_highlight(
    client: Any, bucket: str, video_path: Path, youtube_id: str, job_id: str | None
) -> str:
    storage = client.storage.from_(bucket)
    object_path = f"{youtube_id}/{video_path.name}"
    storage.upload(object_path, str(video_path), {"content-type": "video/mp4", "upsert": True})
    public_url = storage.get_public_url(object_path)

    if job_id:
        client.table("clip_jobs").update({"output_url": public_url}).eq("id", job_id).execute()

    return public_url


@celery_app.task(name="videos.generate_highlight")
def generate_highlight(
    youtube_id: str,
    merged_path: str,
    job_id: str | None = None,
    bucket: str | None = None,
    supabase_client: Any | None = None,
) -> str:
    staged_path = stage_highlight(merged_path, youtube_id, job_id)
    staged_path = _apply_watermark(staged_path)

    if supabase_client is None and os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_KEY"):
        supabase_client = get_supabase_client()

    public_url = None
    resolved_bucket = bucket or os.getenv("MEDIA_BUCKET")
    if supabase_client is not None and resolved_bucket:
        public_url = _upload_highlight(supabase_client, resolved_bucket, staged_path, youtube_id, job_id)

    _cleanup_intermediate_assets(youtube_id)

    return public_url or str(staged_path)
