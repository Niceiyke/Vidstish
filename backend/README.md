# Backend

The backend service is built with FastAPI and will expose ingestion, processing, and publishing APIs. The current focus is `module_8_2` (Paid Tier): supporting unlimited highlights, all transition styles, a Shorts upload mode, and faster queueing for paid users while maintaining free-tier limits.

## Local development

1. Install dependencies from the repository root:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the API locally:
   ```bash
   uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
   ```
3. Health check endpoint: `GET /health` returns `{ "service": "api", "status": "ok" }`.
4. YouTube ingestion endpoint: `POST /ingest` accepts `{ "url": "https://youtu.be/<video_id>", "user_id": "<uuid>" }`, validates the YouTube URL, fetches metadata (title, description, thumbnails, captions availability, duration), persists the record to Supabase, and responds with a normalized payload.
5. Clip segment endpoint: `POST /segments` accepts `{ "user_id": "<uuid>", "youtube_id": "<video_id>", "plan": "free|paid", "transition": "fade", "segments": [{"start": 0, "end": 10, "position": 0}] }`, validates segment bounds against the stored video duration, enforces free-tier fade-only transitions, creates a clip job, and persists ordered segments.
6. Processing pipeline: the worker supports `videos.download` to pull the source YouTube video, `videos.trim` to generate ordered `partN.mp4` clips for each requested segment, `videos.merge_with_transitions` to combine the parts with the requested transition style, and `videos.generate_highlight` to emit the final highlight, upload it to storage, and clean up intermediate artifacts.
7. Job preview endpoint: `GET /job/{job_id}` returns the clip job with transition, ordered segments, video duration, and any available preview URL so clients can monitor progress.
8. YouTube OAuth and publish endpoints (respecting plan quotas):
   - `GET /auth/youtube` returns the consent URL built from `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`, and `YOUTUBE_UPLOAD_SCOPE`.
   - `POST /auth/youtube/exchange` exchanges an OAuth code for tokens and stores them securely in Supabase.
   - `POST /publish` accepts `{ "user_id": "<uuid>", "job_id": "<uuid>", "title": "Highlight title", "description": "...", "tags": ["faith"], "privacy_status": "unlisted", "plan": "free|paid", "shorts_mode": true }`, validates ownership, ensures a highlight file is available, enforces the two-highlights-per-month free-tier limit for free plans, validates Shorts requests against segment totals, and queues a Celery task to run the resumable YouTube upload on the appropriate queue.

### Supabase schema

- `backend/supabase/migrations/0001_create_videos_table.sql` provisions the `videos` table with `user_id`, `youtube_id`, `title`, `duration_seconds`, and `metadata_json` columns plus a unique index on `(user_id, youtube_id)`.
- `backend/supabase/migrations/0002_create_clip_tables.sql` adds `clip_jobs` and `clip_segments` tables for storing ordered segment definitions per video.
- `backend/supabase/migrations/0003_add_trimmed_path_to_segments.sql` adds a `trimmed_path` column so worker tasks can persist the location of generated clip parts.
- `backend/supabase/migrations/0004_add_transition_to_clip_jobs.sql` stores a transition choice per clip job (`fade`, `fadeblack`, `crossfade`, `slide`, `zoom`, `wipe`, `cut`, or `auto`).
- `backend/supabase/migrations/0005_add_output_url_to_clip_jobs.sql` adds an `output_url` column so the final highlight link can be stored after upload.
- `backend/supabase/migrations/0006_create_youtube_tokens.sql` provisions `youtube_tokens` for securely storing OAuth tokens per user.
- `backend/supabase/migrations/0007_add_youtube_url_to_clip_jobs.sql` adds a `youtube_url` column to track the published highlight link.

Future submodules in `plan.json` will continue to expand publishing automation, add YouTube metadata helpers, and layer in subscription-aware constraints.
