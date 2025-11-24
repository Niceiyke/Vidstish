create table if not exists clip_jobs (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null,
    video_id uuid not null references videos(id) on delete cascade,
    created_at timestamptz not null default now()
);

create index if not exists clip_jobs_user_video_idx on clip_jobs(user_id, video_id);

create table if not exists clip_segments (
    id uuid primary key default uuid_generate_v4(),
    job_id uuid not null references clip_jobs(id) on delete cascade,
    start_seconds numeric not null,
    end_seconds numeric not null,
    position integer not null,
    created_at timestamptz not null default now(),
    constraint clip_segment_start_before_end check (end_seconds > start_seconds),
    constraint clip_segment_positive_times check (start_seconds >= 0 and end_seconds >= 0)
);

create index if not exists clip_segments_job_idx on clip_segments(job_id);
