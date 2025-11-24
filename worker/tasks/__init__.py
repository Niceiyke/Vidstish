from worker.tasks.download import download_video
from worker.tasks.highlight import generate_highlight
from worker.tasks.publish import publish_to_youtube
from worker.tasks.trim import trim_segments
from worker.tasks.transitions import merge_with_transitions

__all__ = [
    "download_video",
    "generate_highlight",
    "publish_to_youtube",
    "trim_segments",
    "merge_with_transitions",
]
