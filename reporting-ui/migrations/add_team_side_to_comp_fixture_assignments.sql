-- Add a team side (home / away) to comp fixture analyst allocations.
--
-- Requirement: an analyst is allocated to a TEAM within a fixture (home or
-- away), and a fixture appears in an analyst's profile if they're on either
-- side. Multiple analysts are allowed per side (usually one). This extends the
-- existing flat (fixture, analyst) allocation with which side that allocation
-- is for.
--
-- Backwards compatible: the column is nullable. Rows created before this
-- migration have team_side = NULL, meaning "unspecified side" — the app treats
-- those as still-valid allocations (shown under a neutral/legacy bucket) so no
-- existing allocation is lost.

alter table public.comp_fixture_assignments
    add column if not exists team_side text
        check (team_side in ('home', 'away'));

-- The old uniqueness was (comp_fixture_id, lower(analyst_name)) — one row per
-- analyst per fixture. Now an analyst could legitimately be on both sides, so
-- uniqueness becomes per (fixture, side, analyst). Drop the old index and
-- create the side-aware one. COALESCE keeps NULL (legacy) rows unique too.
drop index if exists idx_comp_fixture_assignments_unique;

create unique index if not exists idx_comp_fixture_assignments_unique
    on public.comp_fixture_assignments (
        comp_fixture_id,
        coalesce(team_side, ''),
        lower(analyst_name)
    );

-- Per-fixture lookup index is unchanged (already exists); nothing to do.
