-- Add the Premier Data external team UID to the `teams` table.
--
-- The competition JSONs (see lib/api/comps.ts) identify each team by a stable
-- external UID (homeTeamUid / awayTeamUid, e.g. 3473). The app's `teams` table
-- previously had no such id — teams were only ever matched by name — so there
-- was no reliable link between a competition fixture's team and the app's team
-- identity (logos, affiliations, analyst profiles).
--
-- This adds `team_uid` so the comp-fixtures sync can record each team's
-- external UID, letting comp_fixtures.home_team_uid / away_team_uid join
-- directly to teams.team_uid. The sync populates it by matching on team NAME
-- first (filling the UID onto the existing row) and creating a new team only
-- when there's no name match — see linkTeamUids() in lib/api/compFixtures.ts.
--
-- NOTE: the `teams` table itself has no create migration in this repo (it was
-- created out-of-band); this ALTER is written to be safe to run against the
-- live table.

alter table public.teams
    add column if not exists team_uid integer;

-- One team per external UID. Partial unique index (ignores NULLs) so existing
-- teams without a UID don't collide, but no two teams can share a UID.
create unique index if not exists idx_teams_team_uid
    on public.teams (team_uid)
    where team_uid is not null;
