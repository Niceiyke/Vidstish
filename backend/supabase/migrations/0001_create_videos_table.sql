create extension if not exists "uuid-ossp";

create table if not exists videos (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null,
    youtube_id text not null,
    title text not null,
    duration_seconds integer not null,
    metadata_json jsonb not null,
    created_at timestamptz not null default now()
);

create unique index if not exists videos_user_youtube_idx on videos(user_id, youtube_id);
