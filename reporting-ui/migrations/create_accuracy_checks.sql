-- Accuracy checks: one row per saved comparison in the Accuracy
-- Comparison tool. Attributes a check to the analyst being graded
-- (analyst_name) and to whoever coded the master file
-- (master_analyst_name), so both a graded-history and a
-- master-checks-completed leaderboard can be built over the season.

create table if not exists public.accuracy_checks (
    id                  bigint generated always as identity primary key,
    created_at          timestamptz not null default now(),

    -- Who was graded, and who coded the master reference.
    analyst_name        text not null,
    master_analyst_name text,

    -- Context / provenance.
    match_label         text,
    file_name_master    text,
    file_name_analyst   text,
    tolerance           integer,

    -- Summary metrics (mirror ComparisonResult.summary).
    accuracy            double precision not null default 0,
    master_total        integer not null default 0,
    analyst_total       integer not null default 0,
    exact               integer not null default 0,
    wrong_stat          integer not null default 0,
    wrong_player        integer not null default 0,
    wrong_team          integer not null default 0,
    missed              integer not null default 0,
    extra               integer not null default 0,
    avg_time_drift      double precision not null default 0,

    -- Deeper breakdowns for trends (stored as JSON).
    category_breakdown  jsonb,
    team_breakdown      jsonb
);

create index if not exists idx_accuracy_checks_analyst
    on public.accuracy_checks (analyst_name);

create index if not exists idx_accuracy_checks_master_analyst
    on public.accuracy_checks (master_analyst_name);

create index if not exists idx_accuracy_checks_created_at
    on public.accuracy_checks (created_at);

-- Allow the anon + service roles to read/write (same posture as the
-- other reporting tables which the client reads/writes with the anon
-- key). RLS is left disabled to match the existing tables in this
-- project.
alter table public.accuracy_checks disable row level security;
