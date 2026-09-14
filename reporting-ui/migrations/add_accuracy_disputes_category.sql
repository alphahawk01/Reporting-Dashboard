-- Add a flag category to disputes so they can be reviewed by type
-- (Player Identification / Stat Difference / Timing/Comparison Error) rather
-- than as one undifferentiated list.
--
-- Stored as a short text code; the app maps it to a display label:
--   'player_identification' -> Player Identification
--   'stat_difference'       -> Stat Difference
--   'timing_comparison'     -> Timing/Comparison Error
-- Nullable so existing disputes remain valid (shown as "Uncategorised").

alter table public.accuracy_disputes
    add column if not exists category text;

-- Index to speed up the by-category breakdown on the Disputes page.
create index if not exists idx_accuracy_disputes_category
    on public.accuracy_disputes (category);
