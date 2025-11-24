# Worker

The worker service will run Celery tasks to handle FFmpeg processing, transitions, and publishing jobs.

The current focus is `module_8_2` (Paid Tier): honoring plan-aware queues for paid uploads, propagating Shorts metadata, and preserving watermark behavior for free users.

## Local development

1. Install dependencies from the repository root:
   ```bash
   pip install -r requirements.txt
   ```
2. Start a Redis instance (e.g., via `docker-compose up redis`).
3. Run the worker:
   ```bash
   celery -A worker.app:celery_app worker --loglevel=info
   ```
4. Health check: `celery -A worker.app:celery_app inspect ping` should return `pong` from the `health.ping` task`. The worker listens on both the default queue and the `PAID_QUEUE_NAME` (defaults to `priority`) for faster paid processing.

## Tasks

- `videos.download` downloads a YouTube URL to `<DOWNLOAD_ROOT>/<youtube_id>/<youtube_id>.mp4` using yt-dlp with `merge_output_format=mp4`. It returns the absolute mp4 path for downstream trimming tasks.
- `videos.trim` slices a downloaded mp4 into ordered `partN.mp4` outputs using `ffmpeg -ss/-to -c copy`, falling back to re-encoding when needed and updating `clip_segments.trimmed_path` when Supabase credentials are provided.
- `videos.merge_with_transitions` concatenates trimmed parts with transition-aware `xfade`/`acrossfade` chains (or `concat` for cuts), ensuring audio/video stay aligned while emitting a merged mp4.
- `videos.generate_highlight` copies the merged output to a highlight directory, watermarks the staged file, uploads it to the configured storage bucket, records the public URL to Supabase, and removes the download/trim/merge folders for the video.
- `videos.publish_to_youtube` refreshes OAuth tokens when needed, requests a resumable upload URL, streams the highlight to YouTube (adding a Shorts tag when requested), and records the resulting `youtube_url` plus updated tokens in Supabase. Paid jobs may be routed to the `PAID_QUEUE_NAME` queue for higher priority.

Set `DOWNLOAD_ROOT` in your environment (defaults to `/tmp/sermonclipper/downloads`) to control where temporary files are written. `TRIM_ROOT` (defaults to `/tmp/sermonclipper/trimmed`) controls where trimmed clip parts are stored. `MERGE_ROOT` (defaults to `/tmp/sermonclipper/merged`) controls where merged highlights are written. `HIGHLIGHT_ROOT` (defaults to `/tmp/sermonclipper/highlights`) controls where final highlights are staged before upload. `WATERMARK_PATH`, `WATERMARK_POSITION`, and `WATERMARK_TEXT` can be used to customize the overlay applied during highlight generation. `PAID_QUEUE_NAME` defines the Celery queue used for paid uploads, and `SHORTS_MAX_DURATION` controls the API-side cap for Shorts submissions.
