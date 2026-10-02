-- Fixture timeline overrides
-- ---------------------------------------------------------------------------
-- Stores an EDITED version of a fixture's report JSON, keyed by the JADE
-- fixture id (the {FixtureID} in s3://premierdata01/JSON/Fixture/Reports{id}.json).
--
-- The app reads the override FIRST when opening a fixture; if none exists it
-- falls back to the original S3 report. This lets edits made in the UI persist
-- and be shown to every user — without writing to the shared S3 bucket (yet).
--
-- `report_json` holds the full report object (same shape as the S3 file), so
-- the saved override is a drop-in replacement and can later be pushed to S3
-- verbatim once a server-side write path exists.
--
-- Run this once in the Supabase SQL editor.

create table if not exists public.fixture_report_overrides (
  fixture_id   bigint primary key,
  report_json  jsonb not null,
  event_count  integer,
  updated_at   timestamptz not null default now(),
  updated_by   text
);

comment on table public.fixture_report_overrides is
  'Edited fixture report JSON, keyed by JADE fixture id. Read in preference to the S3 original.';

-- Keep updated_at fresh on every write.
create or replace function public.touch_fixture_report_override()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_fixture_report_override on public.fixture_report_overrides;
create trigger trg_touch_fixture_report_override
  before update on public.fixture_report_overrides
  for each row execute function public.touch_fixture_report_override();

-- The app uses the anon/service keys (no per-user auth rows), matching the rest
-- of this project's tables. Enable RLS with permissive policies so the anon key
-- can read/write (mirrors how accuracy_checks etc. are accessed here).
alter table public.fixture_report_overrides enable row level security;

drop policy if exists "overrides read"  on public.fixture_report_overrides;
drop policy if exists "overrides write" on public.fixture_report_overrides;

create policy "overrides read"
  on public.fixture_report_overrides for select
  using (true);

create policy "overrides write"
  on public.fixture_report_overrides for all
  using (true) with check (true);
