-- Platform analysts: a shared source of truth for analyst identity in the
-- Supabase-backed parts of the app. New analysts added here flow through to
-- the Accuracy Comparison dropdowns and are merged into the Analyst
-- Management view, so a name added once is visible platform-wide.
--
-- Matching across the app is by human-readable name (there is no shared id
-- with the external .NET analysts API), so the name is stored trimmed and a
-- case-insensitive unique index prevents duplicate spellings/casing.

create table if not exists public.analysts (
    id          bigint generated always as identity primary key,
    created_at  timestamptz not null default now(),

    name        text not null,
    email       text
);

-- Case-insensitive uniqueness on the name so "Corey Burl" and "corey burl"
-- can't both be inserted. Bulk add relies on this to skip duplicates.
create unique index if not exists idx_analysts_name_lower
    on public.analysts (lower(name));

create index if not exists idx_analysts_created_at
    on public.analysts (created_at);

-- Same RLS posture as the other reporting tables (client uses the anon key
-- for read/write). RLS disabled to match existing tables in this project.
alter table public.analysts disable row level security;
