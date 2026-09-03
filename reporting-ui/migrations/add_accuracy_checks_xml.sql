-- Store the raw master + analyst XML with each accuracy check so a
-- saved check can be fully re-opened (parsed + re-compared) in the
-- Accuracy Comparison tab, not just shown as stored aggregates.
--
-- Run this in the Supabase SQL editor.

alter table public.accuracy_checks
    add column if not exists xml_master  text,
    add column if not exists xml_analyst text;
