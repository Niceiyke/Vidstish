import os
import shutil
from pathlib import Path
from typing import Tuple

from yt_dlp import YoutubeDL

from worker.app import celery_app


def get_download_root() -> Path:
    """Return the root directory for temporary downloads."""

    return Path(os.getenv("DOWNLOAD_ROOT", "/tmp/sermonclipper/downloads"))


def ensure_video_dir(youtube_id: str) -> Path:
    """Create and return the directory for a video's temporary assets."""

    target_dir = get_download_root() / youtube_id
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir


def build_output_paths(youtube_id: str) -> Tuple[Path, str]:
    """Return the expected mp4 path and yt-dlp template for a video."""

    directory = ensure_video_dir(youtube_id)
    template = directory / f"{youtube_id}.%(ext)s"
    target_path = directory / f"{youtube_id}.mp4"
    return target_path, str(template)


@celery_app.task(name="videos.download")
def download_video(youtube_url: str, youtube_id: str) -> str:
    """Download a YouTube video as MP4 using yt-dlp.

    The task stores the file in a temporary directory under the configured
    DOWNLOAD_ROOT and returns the absolute path to the mp4 file.
    """

    target_path, output_template = build_output_paths(youtube_id)
    ydl_opts = {
        "outtmpl": output_template,
        "format": "mp4/bestvideo+bestaudio/best",
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
    }

    with YoutubeDL(ydl_opts) as ydl:
        ydl.download([youtube_url])

    if not target_path.exists():
        raise FileNotFoundError(f"Expected downloaded video at {target_path}")

    return str(target_path)


@celery_app.task(name="videos.cleanup")
def cleanup_video(youtube_id: str) -> bool:
    """Delete the temporary directory created for a video download."""

    directory = get_download_root() / youtube_id
    if directory.exists():
        shutil.rmtree(directory, ignore_errors=True)
    return not directory.exists()
