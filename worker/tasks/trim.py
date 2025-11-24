import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List

from worker.app import celery_app
from worker.db import get_supabase_client


def get_trim_root() -> Path:
    """Return the root directory for trimmed clip outputs."""

    return Path(os.getenv("TRIM_ROOT", "/tmp/sermonclipper/trimmed"))


def ensure_trim_dir(youtube_id: str) -> Path:
    """Create and return the directory for a video's trimmed parts."""

    target_dir = get_trim_root() / youtube_id
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir


def _run_ffmpeg(command: List[str]) -> subprocess.CompletedProcess:
    return subprocess.run(command, check=True, capture_output=True)


def _trim_segment(
    input_path: str, start: float, end: float, output_path: Path
) -> Path:
    copy_cmd = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-ss",
        str(start),
        "-to",
        str(end),
        "-c",
        "copy",
        str(output_path),
    ]

    try:
        _run_ffmpeg(copy_cmd)
    except subprocess.CalledProcessError:
        reencode_cmd = [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-ss",
            str(start),
            "-to",
            str(end),
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            str(output_path),
        ]
        _run_ffmpeg(reencode_cmd)

    if not output_path.exists():
        raise FileNotFoundError(f"Trimmed segment not found at {output_path}")

    return output_path


def _update_trimmed_paths(
    supabase_client: Any, segment_paths: List[Dict[str, str]]
) -> None:
    for entry in segment_paths:
        segment_id = entry.get("id")
        path = entry.get("path")
        if not segment_id:
            continue
        supabase_client.table("clip_segments").update({"trimmed_path": path}).eq(
            "id", segment_id
        ).execute()


@celery_app.task(name="videos.trim")
def trim_segments(
    youtube_id: str,
    input_path: str,
    segments: List[Dict[str, Any]],
    job_id: str | None = None,
    supabase_client: Any | None = None,
) -> List[str]:
    """Trim a set of segments into discrete mp4 parts.

    The task first attempts fast copy trimming, then falls back to re-encoding
    if the copy operation fails. Each output is named `partN.mp4` and stored in
    a TRIM_ROOT/<youtube_id> directory. When a Supabase client is available,
    trimmed paths are written back to the `clip_segments` table.
    """

    if supabase_client is None and os.getenv("SUPABASE_URL") and os.getenv(
        "SUPABASE_SERVICE_KEY"
    ):
        supabase_client = get_supabase_client()

    trim_dir = ensure_trim_dir(youtube_id)
    sorted_segments = sorted(segments, key=lambda s: s.get("position", 0))

    segment_paths: List[Dict[str, str]] = []
    for idx, segment in enumerate(sorted_segments, start=1):
        output_path = trim_dir / f"part{idx}.mp4"
        trimmed_path = _trim_segment(
            input_path, float(segment.get("start")), float(segment.get("end")), output_path
        )
        segment_paths.append(
            {
                "id": segment.get("id"),
                "path": str(trimmed_path),
                "position": segment.get("position", idx - 1),
            }
        )

    if supabase_client is not None:
        _update_trimmed_paths(supabase_client, segment_paths)

    return [entry["path"] for entry in segment_paths]
