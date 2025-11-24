alter table if exists clip_jobs
    add column if not exists output_url text;
