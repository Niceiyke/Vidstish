alter table clip_segments
    add column if not exists trimmed_path text;
