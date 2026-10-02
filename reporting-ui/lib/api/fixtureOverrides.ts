// Fixture report overrides — edited timeline JSON persisted in Supabase.
//
// When a fixture's timeline is edited in the UI, the full edited report object
// is saved here (keyed by JADE fixture id). The timeline loader reads this
// override in preference to the original S3 report, so edits persist and are
// shown to every user — without writing to the shared S3 bucket.
//
// `report_json` is the SAME shape as the S3 Reports{id}.json file, so a saved
// override is a drop-in replacement and can later be pushed to S3 verbatim once
// a server-side write path exists.

import { supabase } from "@/lib/supabase";
import type { FixtureReport } from "@/types/fixtureReport";

const TABLE = "fixture_report_overrides";

export interface FixtureOverride {
  fixtureId: number;
  report: FixtureReport;
  eventCount: number | null;
  updatedAt: string;
  updatedBy: string | null;
}

/**
 * Fetch the saved override for a fixture, or null when none exists. A missing
 * table or any read error resolves to null so the caller cleanly falls back to
 * the original S3 report (the override layer is strictly additive).
 */
export async function getFixtureOverride(
  fixtureId: number | string
): Promise<FixtureOverride | null> {
  const id = Number(fixtureId);
  if (!Number.isFinite(id)) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("fixture_id, report_json, event_count, updated_at, updated_by")
      .eq("fixture_id", id)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      fixture_id: number;
      report_json: FixtureReport;
      event_count: number | null;
      updated_at: string;
      updated_by: string | null;
    };
    return {
      fixtureId: row.fixture_id,
      report: row.report_json,
      eventCount: row.event_count,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  } catch {
    return null;
  }
}

/**
 * Upsert the edited report for a fixture. Overwrites any existing override for
 * the same fixture id (one current version per fixture). Throws on failure so
 * the UI can surface a save error.
 */
export async function saveFixtureOverride(input: {
  fixtureId: number | string;
  report: FixtureReport;
  updatedBy?: string | null;
}): Promise<void> {
  const id = Number(input.fixtureId);
  if (!Number.isFinite(id)) {
    throw new Error("Invalid fixture id.");
  }
  const eventCount = Array.isArray(input.report.allStatistics)
    ? input.report.allStatistics.length
    : null;
  const { error } = await supabase.from(TABLE).upsert(
    {
      fixture_id: id,
      report_json: input.report,
      event_count: eventCount,
      updated_by: input.updatedBy ?? null,
    },
    { onConflict: "fixture_id" }
  );
  if (error) {
    throw new Error(error.message || "Failed to save the edited timeline.");
  }
}

/** Remove a fixture's override, reverting to the original S3 report. */
export async function deleteFixtureOverride(
  fixtureId: number | string
): Promise<void> {
  const id = Number(fixtureId);
  if (!Number.isFinite(id)) return;
  const { error } = await supabase.from(TABLE).delete().eq("fixture_id", id);
  if (error) {
    throw new Error(error.message || "Failed to clear the override.");
  }
}
