-- Competition fixtures, mirrored from the S3 competition JSONs.
--
-- The source is one JSON per competition at
--   https://premierdata01.s3.ap-southeast-2.amazonaws.com/JSON/Comps/c_<uid>.json
-- Each file holds a competition (sport + season + name) and its rounds/fixtures.
-- The bucket can't be listed and has no manifest, so sport/season/fixtures are
-- only knowable by fetching each JSON. Downloading all ~440 files on every page
-- load was the performance problem this table solves: the JSONs are swept ONCE
-- into Supabase, then the /comp-fixtures page reads fast, filtered SQL instead
-- of hitting S3. See lib/api/compFixtures.ts for the sync + query functions.
--
-- Three objects:
--   comp_fixtures      — one row per fixture (the flattened data the page shows)
--   comp_sources       — one row per competition file (uid + last-modified, so
--                        incremental sync only refetches CHANGED comps and can
--                        probe for NEW comp ids past the highest known one)
--   comp_sync_meta     — a single row of overall sync state (last run, max uid)

-- ------------------------------------------------------------------
-- comp_fixtures: the flattened fixture rows the page queries/filters.
-- ------------------------------------------------------------------
create table if not exists public.comp_fixtures (
    -- "<competition_uid>:<fixture_uid>" — stable across syncs so upserts replace
    -- rather than duplicate.
    id                text primary key,

    competition_uid   integer not null,
    competition       text not null default '',
    -- The competition season/year (e.g. 2026) — drives the Year filter.
    season            integer,
    -- The raw sportName from the JSON (e.g. "Australian Rules Football",
    -- "Soccer") — drives the Sport filter.
    sport             text not null default '',

    round             text not null default '',
    -- Parsed match date (from the JSON's dd/MM/yyyy fixtureDate). NULL when the
    -- source date is blank/unparseable. Drives the date-range filter + sort.
    fixture_date      date,
    fixture_time      text not null default '',

    home_team         text not null default '',
    away_team         text not null default '',
    home_team_uid     integer,
    away_team_uid     integer,

    is_final          boolean not null default false,
    -- Final score "62 - 50" when a result exists, else ''.
    score             text not null default '',

    video_url         text not null default '',
    video_name        text not null default '',

    -- home|away|competition|round, normalised — the cross-system match key used
    -- elsewhere in the app (see the Fixtures page keyFor()).
    game_key          text not null default '',

    updated_at        timestamptz not null default now()
);

-- Indexes for the page's filters (sport, season, date range) and grouping.
create index if not exists idx_comp_fixtures_sport
    on public.comp_fixtures (sport);
create index if not exists idx_comp_fixtures_season
    on public.comp_fixtures (season);
create index if not exists idx_comp_fixtures_date
    on public.comp_fixtures (fixture_date);
create index if not exists idx_comp_fixtures_competition_uid
    on public.comp_fixtures (competition_uid);
-- Common combined filter (Sport + Year) — the default view.
create index if not exists idx_comp_fixtures_sport_season
    on public.comp_fixtures (sport, season);

-- ------------------------------------------------------------------
-- comp_sources: one row per competition FILE seen in S3.
--
-- Tracks each comp's S3 Last-Modified so an incremental sync can HEAD-check
-- every known comp cheaply and only re-download the ones that changed. `status`
-- records whether the uid currently resolves to a real file (S3 returns 403 for
-- a missing key) so probing can tell "gap" from "end of range".
-- ------------------------------------------------------------------
create table if not exists public.comp_sources (
    competition_uid   integer primary key,
    -- 'ok' = file exists and was fetched; 'missing' = S3 returned 403/404.
    status            text not null default 'ok',
    -- The S3 object's Last-Modified header at last fetch (for change detection).
    last_modified     text,
    -- Denormalised for quick reference/debugging (also live on comp_fixtures).
    sport             text,
    season            integer,
    name              text,
    -- How many fixtures this comp contributed at last sync.
    fixture_count     integer not null default 0,
    checked_at        timestamptz not null default now(),
    fetched_at        timestamptz
);

create index if not exists idx_comp_sources_status
    on public.comp_sources (status);

-- ------------------------------------------------------------------
-- comp_sync_meta: a single row (id = true) of overall sync state, so the UI
-- can show "last synced" and the incremental probe knows where to start.
-- ------------------------------------------------------------------
create table if not exists public.comp_sync_meta (
    -- Enforces a single row.
    id                boolean primary key default true,
    last_full_sync    timestamptz,
    last_incremental  timestamptz,
    -- Highest competition uid confirmed to exist — the probe for NEW comps
    -- starts at max_uid + 1.
    max_uid           integer,
    -- Totals from the most recent sync, for display.
    comp_count        integer not null default 0,
    fixture_count     integer not null default 0,
    constraint comp_sync_meta_singleton check (id = true)
);

insert into public.comp_sync_meta (id)
    values (true)
on conflict (id) do nothing;

-- Same RLS posture as the other reporting tables (client uses the anon key for
-- read/write). RLS disabled to match existing tables in this project.
alter table public.comp_fixtures  disable row level security;
alter table public.comp_sources   disable row level security;
alter table public.comp_sync_meta disable row level security;
