alter table if exists clip_jobs
    add column if not exists transition text not null default 'auto',
    add constraint clip_jobs_transition_check check (transition in ('fade', 'fadeblack', 'crossfade', 'slide', 'zoom', 'wipe', 'cut', 'auto'));
