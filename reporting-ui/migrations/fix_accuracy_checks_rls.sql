-- FIX: "new row violates row-level security policy for table
-- accuracy_checks".
--
-- The Supabase dashboard enables RLS by default on new tables. With RLS
-- on and no policy, the anon key (which this app uses) can't insert.
--
-- Option A (recommended here): disable RLS, matching every other table
-- in this project which the client reads/writes with the anon key.
-- Run this in the Supabase SQL editor:

alter table public.accuracy_checks disable row level security;


-- ------------------------------------------------------------------
-- Option B (if you'd rather KEEP RLS on): instead of the line above,
-- leave RLS enabled and add permissive policies for the anon role.
-- Only use ONE of the two options.
--
--   alter table public.accuracy_checks enable row level security;
--
--   create policy "anon read accuracy_checks"
--     on public.accuracy_checks for select
--     to anon using (true);
--
--   create policy "anon insert accuracy_checks"
--     on public.accuracy_checks for insert
--     to anon with check (true);
--
--   create policy "anon delete accuracy_checks"
--     on public.accuracy_checks for delete
--     to anon using (true);
