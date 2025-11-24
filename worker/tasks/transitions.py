import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Tuple

from worker.app import celery_app

TRANSITION_NAME_MAP = {
    "fade": "fade",
    "fadeblack": "fadeblack",
    "crossfade": "fade",
    "slide": "slideleft",
    "zoom": "zoom",
    "wipe": "wipeleft",
    "cut": "cut",
    "auto": "fade",
}


def get_merge_root() -> Path:
    return Path(os.getenv("MERGE_ROOT", "/tmp/sermonclipper/merged"))


def _run_ffmpeg(command: List[str]) -> subprocess.CompletedProcess:
    return subprocess.run(command, check=True, capture_output=True)


def resolve_transition_name(name: str | None) -> str:
    transition = (name or "fade").lower()
    if transition not in TRANSITION_NAME_MAP:
        raise ValueError(f"Unsupported transition '{name}'")
    return TRANSITION_NAME_MAP[transition]


def build_transition_filters(
    durations: List[float], transition: str, duration_seconds: float = 1.0
) -> Tuple[List[str], str, str]:
    if not durations:
        raise ValueError("At least one segment duration is required")

    if len(durations) == 1 or transition == "cut":
        video_inputs = "".join(f"[{idx}:v]" for idx in range(len(durations)))
        audio_inputs = "".join(f"[{idx}:a]" for idx in range(len(durations)))
        filters = [
            f"{video_inputs}concat=n={len(durations)}:v=1:a=0[vout]",
            f"{audio_inputs}concat=n={len(durations)}:v=0:a=1[aout]",
        ]
        return filters, "[vout]", "[aout]"

    ffmpeg_transition = resolve_transition_name(transition)

    filters: List[str] = []
    prev_video = "[0:v]"
    prev_audio = "[0:a]"
    offset = durations[0] - duration_seconds

    for idx in range(1, len(durations)):
        out_video = f"[v{idx}]"
        out_audio = f"[a{idx}]"
        safe_offset = max(offset, 0)
        filters.append(
            f"{prev_video}[{idx}:v]xfade=transition={ffmpeg_transition}:duration={duration_seconds}:offset={safe_offset}{out_video}"
        )
        filters.append(
            f"{prev_audio}[{idx}:a]acrossfade=d={duration_seconds}{out_audio}"
        )
        prev_video = out_video
        prev_audio = out_audio
        offset += durations[idx] - duration_seconds

    return filters, prev_video, prev_audio


def _extract_duration(segment: Dict[str, Any]) -> float:
    if "duration" in segment:
        return float(segment["duration"])
    if "start" in segment and "end" in segment:
        return float(segment["end"]) - float(segment["start"])
    raise ValueError("Each segment must include a duration or start/end")


def merge_command(
    segments: List[Dict[str, Any]],
    transition: str = "fade",
    transition_duration: float = 1.0,
    output_path: Path | None = None,
) -> Tuple[List[str], Path]:
    if not segments:
        raise ValueError("At least one segment is required to merge")

    sorted_segments = sorted(segments, key=lambda s: s.get("position", 0))
    input_paths = [str(Path(item["path"])) for item in sorted_segments]
    durations = [_extract_duration(item) for item in sorted_segments]

    if output_path is None:
        output_dir = get_merge_root()
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / "merged.mp4"
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)

    if len(input_paths) == 1:
        command = [
            "ffmpeg",
            "-y",
            "-i",
            input_paths[0],
            "-c",
            "copy",
            str(output_path),
        ]
        return command, output_path

    filters, final_video, final_audio = build_transition_filters(
        durations, transition, duration_seconds=transition_duration
    )

    filter_complex = ";".join(filters)
    command: List[str] = ["ffmpeg", "-y"]
    for path in input_paths:
        command.extend(["-i", path])

    command.extend(
        [
            "-filter_complex",
            filter_complex,
            "-map",
            final_video,
            "-map",
            final_audio,
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            str(output_path),
        ]
    )

    return command, output_path


@celery_app.task(name="videos.merge_with_transitions")
def merge_with_transitions(
    youtube_id: str,
    segments: List[Dict[str, Any]],
    transition: str = "fade",
    job_id: str | None = None,
    transition_duration: float = 1.0,
) -> str:
    suffix = f"{job_id}.mp4" if job_id else "merged.mp4"
    output_dir = get_merge_root() / youtube_id
    command, output_path = merge_command(
        segments,
        transition=transition,
        transition_duration=transition_duration,
        output_path=output_dir / suffix,
    )

    _run_ffmpeg(command)

    if not output_path.exists():
        raise FileNotFoundError(f"Merged output not found at {output_path}")

    return str(output_path)
