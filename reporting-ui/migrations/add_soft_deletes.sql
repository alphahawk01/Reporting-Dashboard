-- Soft deletes for accuracy checks and their disputes.
--
-- Previously deleteAccuracyCheck / deleteDispute issued a hard SQL DELETE, so a
-- deleted check (and, via ON DELETE CASCADE, its disputes) was gone for good and
-- could not be reviewed or restored. This adds a nullable `deleted_at` marker so
-- deletion becomes an UPDATE (deleted_at = now()) instead of a physical delete.
--
-- Because delete is now an UPDATE, the accuracy_disputes ON DELETE CASCADE never
-- fires — a soft-deleted check keeps its disputes intact for review. Disputes get
-- their own deleted_at too (for flagged-by-mistake removals).
--
-- All active read queries filter `deleted_at is null`; a "Deleted checks" review
-- view reads the rows where it is NOT null and can clear it to restore.
--
-- Convention (matches other migrations): RLS stays disabled; run manually in the
-- Supabase SQL editor; idempotent via `if not exists`.

-- ── accuracy_checks ────────────────────────────────────────────────────────
alter table public.accuracy_checks
    add column if not exists deleted_at timestamptz;

-- Who soft-deleted it (username), for the review view. Nullable.
alter table public.accuracy_checks
    add column if not exists deleted_by text;

-- Partial index: the common query is "active rows only" (deleted_at is null),
-- so index just those. Keeps active-list reads fast without indexing the
-- (smaller) set of deleted rows.
create index if not exists idx_accuracy_checks_active
    on public.accuracy_checks (created_at)
    where deleted_at is null;

-- Index the deleted rows for the review/trash view.
create index if not exists idx_accuracy_checks_deleted
    on public.accuracy_checks (deleted_at)
    where deleted_at is not null;

-- ── accuracy_disputes ──────────────────────────────────────────────────────
alter table public.accuracy_disputes
    add column if not exists deleted_at timestamptz;

alter table public.accuracy_disputes
    add column if not exists deleted_by text;

create index if not exists idx_accuracy_disputes_active
    on public.accuracy_disputes (check_id)
    where deleted_at is null;
