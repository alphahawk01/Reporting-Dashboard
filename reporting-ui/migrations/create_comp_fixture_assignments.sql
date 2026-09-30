-- Analyst allocations for competition fixtures.
--
-- Comp fixtures live in Supabase (comp_fixtures), not the .NET download
-- pipeline, so their analyst allocations are recorded here rather than through
-- the AutoDownload API. One row per (fixture, analyst) — a fixture can have
-- several analysts, mirroring the Fixtures tab. Allocations are keyed by
-- analyst NAME, the stable identifier the consolidated analyst list uses across
-- the platform (see getAllAnalysts()); there's no shared numeric analyst id
-- across the .NET and Supabase sources.

create table if not exists public.comp_fixture_assignments (
    id                bigint generated always as identity primary key,
    created_at        timestamptz not null default now(),

    -- The comp_fixtures.id this allocation is for ("<compUid>:<fixtureUid>").
    comp_fixture_id   text not null,
    -- The allocated analyst's canonical name (from getAllAnalysts()).
    analyst_name      text not null
);

-- One allocation per analyst per fixture; case-insensitive on the name so the
-- same analyst can't be added twice with different casing. Assign upserts rely
-- on this.
create unique index if not exists idx_comp_fixture_assignments_unique
    on public.comp_fixture_assignments (comp_fixture_id, lower(analyst_name));

-- Fast lookup of all allocations for a set of fixtures (the page batches by id).
create index if not exists idx_comp_fixture_assignments_fixture
    on public.comp_fixture_assignments (comp_fixture_id);

-- Same RLS posture as the other reporting tables (client uses the anon key for
-- read/write). RLS disabled to match existing tables in this project.
alter table public.comp_fixture_assignments disable row level security;
