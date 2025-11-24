# Frontend

The frontend uses Next.js to provide the SermonClipper dashboard, upload workflows, and timeline editor. The current UI delivers a draggable segment timeline that lets users add, remove, reorder, and save sermon highlight definitions, select a subscription plan, and choose a transition style to send to the backend API. It also includes a job preview panel that pulls `GET /job/{job_id}` to surface the requested transition, duration, segments, and preview playback once available, plus a publish form to queue YouTube uploads with plan selection, Shorts mode, title, description, tags, and privacy settings.

## Local development

From `frontend/`, install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Run the component tests with Jest from `frontend/`:

```bash
npm test
```

The app defaults to `http://localhost:3000` and is expected to call the API at `NEXT_PUBLIC_API_BASE_URL` (set in `.env`).
