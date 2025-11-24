# SermonClipper

SermonClipper is a SaaS tool for generating multi-segment sermon highlights with seamless transitions and direct YouTube publishing. Development follows the structured roadmap defined in `plan.json`.

## Project Structure

- `backend/` – FastAPI application, Supabase integration, and API endpoints.
- `frontend/` – Next.js interface for uploading sermons, selecting segments, and managing jobs.
- `worker/` – Background processing pipeline, Celery tasks, and FFmpeg operations.

## Getting Started

1. Copy `.env.example` to `.env` and fill in the required values.
2. Ensure Python 3.11+ and Node.js 18+ are available for backend and frontend development.
3. Install backend dependencies with `pip install -r requirements.txt` and frontend dependencies with `npm install` from `frontend/`.
4. Start the local stack with `docker-compose up --build` to run the API, worker, and Redis together.
5. Follow the roadmap in `plan.json`, progressing through each module sequentially.

## Development Roadmap

All development tasks are defined in `plan.json`. Progress through each module and submodule sequentially, completing deliverables before moving on. The current focus is `module_8_2` (Paid Tier): unlocking unlimited highlights, all transition styles, Shorts uploads, and faster queueing for paid users while keeping free-tier safeguards in place.
