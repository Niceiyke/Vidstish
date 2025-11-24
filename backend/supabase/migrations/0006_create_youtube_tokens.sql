create table if not exists youtube_tokens (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null unique,
    access_token text not null,
    refresh_token text not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists youtube_tokens_user_idx on youtube_tokens(user_id);
