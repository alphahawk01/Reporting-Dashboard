// JSON-event -> Instance adapter for the accuracy comparison engine.
//
// The comparison engine (see xml-compare.ts) matches two sets of `Instance`
// records built from SportsCode XML. A separate data source provides the same
// coded events as JSON, e.g.:
//
//   {
//     "uid": 1123,
//     "quarter": 1,
//     "relativeTime": 2795,          // the actual moment of the action
//     "statTypeCode": "Carry",       // -> category
//     "statTypeName": "Carry",       // -> stat
//     "playerName": "Jacob Maddox",
//     "playerNumber": 8,             // -> playerNumber
//     "teamName": "Merthyr Town FC", // -> team (raw; canonicalised later)
//     "teamUid": 2,                  // 1 = home, 2 = away (authoritative)
//     "startWidth": 100,
//     "startHeight": 100
//   }
//
// This adapter converts those JSON events into the SAME `Instance` shape the
// XML parser emits, so they flow through `compareInstances` unchanged — all
// the matching, tolerance and accuracy logic stays in one place.
//
// Confirmed against a real Chester FC vs Merthyr Town FC feed + master XML:
//   - `relativeTime` is WHOLE-MATCH SECONDS (it keeps climbing across the
//     quarter boundary, e.g. Q1 ends ~2828s, Q2 starts ~2836s), so no
//     per-quarter offset is needed.
//   - `relativeTime` lines up with the XML instance <start> (e.g. feed event
//     at 5877s == XML instance start 5877/end 5887), so it maps to `start`;
//     the engine derives the code-time `mid` from start/end via codeTime().
//   - stat detail lives in `statTypeCode` (statTypeName is coarse, e.g.
//     "Pass"), so matching is driven by the code -> STAT_CODE_MAP.
//
// These remain configurable via JsonAdapterOptions for other feeds that may
// differ (getting the time base wrong silently shifts events out of the match
// tolerance).

import {
  type Instance,
  buildCode,
  codeTime,
} from "./xml-compare";

/** A single coded event as delivered by the JSON feed. */
export type JsonEvent = {
  uid: number | string;
  /** Period marker (1-based). Used with quarterOffsets to build a match clock. */
  quarter?: number;
  /** The actual moment of the action, in the feed's own time unit/base. */
  relativeTime: number;
  /** Stat category code, e.g. "Carry". */
  statTypeCode?: string;
  /** Human stat name, e.g. "Carry". Mapped to a canonical stat label. */
  statTypeName: string;
  playerName?: string;
  playerNumber?: number | null;
  teamName?: string;
  /** Team identity. Conventionally 1 = home, 2 = away. */
  teamUid?: number;
  /** Pitch coordinates (unused by the matcher; carried through if needed). */
  startWidth?: number;
  startHeight?: number;
};

export type JsonAdapterOptions = {
  /**
   * Unit of `relativeTime`. The comparison engine works in SECONDS, so ms
   * inputs are divided by 1000. Default: "seconds".
   */
  timeUnit?: "seconds" | "milliseconds";

  /**
   * Seconds to ADD to `relativeTime` for each quarter, keyed by the `quarter`
   * value, to build a single whole-match clock. Only needed when the feed's
   * `relativeTime` RESETS each period. Example (20-min quarters, in seconds):
   *   { 1: 0, 2: 1200, 3: 2400, 4: 3600 }
   * If omitted, `relativeTime` is treated as already being a whole-match time.
   */
  quarterOffsets?: Record<number, number>;

  /**
   * How to interpret `relativeTime`:
   *   - "start-marker" (DEFAULT): it equals the XML instance <start>. The
   *     code-time `mid` is derived with the XML's codeTime() so stat offsets
   *     (goal +45s, corner +5s, …) match the master. This is correct for the
   *     confirmed Chester/Merthyr feed.
   *   - "code-time": it is already the true moment of the action; use it
   *     directly as `mid` with no offset. For feeds that pre-resolve timing.
   */
  timeSemantics?: "code-time" | "start-marker";

  /**
   * Map a raw event to the canonical stat label used by the XML and the
   * STAT_PREFERENCES tables (all lowercased there via normStat). Receives both
   * the coarse `statTypeName` and the detailed `statTypeCode`; the detail
   * lives in the CODE (e.g. "ShortPassEffective"), so prefer it. If omitted,
   * `defaultMapStatName` is used (code-driven, see STAT_CODE_MAP).
   */
  mapStatName?: (statTypeName: string, statTypeCode?: string) => string;

  /**
   * Map an event to the category (the XML `<label><group>`, e.g. "Passing").
   * Defaults to the (mapped) stat label, since the feed's `statTypeCode` is
   * consumed for the fine-grained stat, not the category.
   */
  mapCategory?: (event: JsonEvent, mappedStat: string) => string;
};

/**
 * Convert one JSON event into the whole-match code time (seconds), applying
 * the unit conversion and per-quarter offset. Returns NaN if relativeTime is
 * not a finite number (such events are dropped by jsonEventsToInstances).
 */
function eventTime(ev: JsonEvent, opts: JsonAdapterOptions): number {
  const raw = ev.relativeTime;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return NaN;
  const inSeconds = opts.timeUnit === "milliseconds" ? raw / 1000 : raw;
  const offset =
    ev.quarter != null && opts.quarterOffsets
      ? opts.quarterOffsets[ev.quarter] ?? 0
      : 0;
  return inSeconds + offset;
}

/**
 * Convert JSON events into the `Instance[]` shape consumed by
 * `compareInstances`. Events with a non-finite `relativeTime` are skipped
 * (mirrors the XML parser dropping instances with NaN start). Instances are
 * returned sorted by code time, matching parseInstances' output order.
 *
 * TIME SEMANTICS (critical for matching):
 * `relativeTime` corresponds to the XML instance <start>. The feed has no
 * separate lead/lag window, so end = start. The code-time `mid` — which the
 * matcher actually compares — is then computed with the SAME `codeTime()` the
 * XML parser uses, so stat-specific offsets (a goal is coded +45s after start,
 * corners +5s, etc.) are applied identically on both sides. Skipping this
 * would push offset stats (goals, corners, throw-ins…) out of tolerance
 * against the master XML.
 */
export function jsonEventsToInstances(
  events: JsonEvent[],
  opts: JsonAdapterOptions = {}
): Instance[] {
  const instances: Instance[] = [];

  for (const ev of events) {
    const start = eventTime(ev, opts);
    if (Number.isNaN(start)) continue;

    const stat = opts.mapStatName
      ? opts.mapStatName(ev.statTypeName, ev.statTypeCode)
      : defaultMapStatName(ev.statTypeName, ev.statTypeCode);
    const category = opts.mapCategory
      ? opts.mapCategory(ev, stat)
      : defaultMapCategory(ev.statTypeCode, stat);

    const team = (ev.teamName ?? "").trim();
    const playerNumber =
      typeof ev.playerNumber === "number" ? ev.playerNumber : null;
    const playerRaw = ev.playerName?.trim() ?? "";

    // Build a code string in the same "<Team> - #<n>. <name>" convention the
    // XML uses, so anything that re-derives fields from `code` stays valid.
    const code = buildCode(team, playerNumber, playerRaw);

    // No lead/lag window in the feed: end == start. Derive the code-time the
    // same way the XML side does so both align (offsets applied identically).
    // When timeSemantics is "code-time", relativeTime IS already the code time
    // (some feeds provide the true moment), so use it directly as mid.
    const end = start;
    const mid =
      opts.timeSemantics === "code-time"
        ? start
        : codeTime(stat.trim(), start, end);

    instances.push({
      id: String(ev.uid ?? crypto.randomUUID()),
      start,
      end,
      mid,
      team,
      playerNumber,
      playerRaw,
      stat: stat.trim(),
      category: category.trim(),
      code,
    });
  }

  instances.sort((a, b) => a.mid - b.mid);
  return instances;
}

// ---------------------------------------------------------------------------
// statTypeCode -> canonical XML stat label
// ---------------------------------------------------------------------------
//
// IMPORTANT: the JSON feed carries the reliable stat detail in `statTypeCode`
// (e.g. "ShortPassEffective"), NOT `statTypeName` (which is coarse, e.g.
// "Pass" for every pass variant). The comparison engine's STAT_PREFERENCES
// tables (xml-compare.ts) are keyed on the fine-grained XML labels such as
// "short passes successful", so matching MUST be driven by the code.
//
// Observed code pattern: {Length}{Type}{Effective|Ineffective}, e.g.
//   ShortPassEffective   -> "Short Passes Successful"
//   ShortPassIneffective -> "Short Passes Unsuccessful"
//   LongPassEffective    -> "Long Passes Successful"
//
// NOTE on the XML's spelling quirk: crosses use the source misspelling
// "unsuccesful" (single 's') — see STAT_PREFERENCES. That's why crosses get an
// explicit entry below rather than going through the generic pass builder.
//
// This map is intentionally small and covers only what the samples confirm.
// Extend it as the full `statTypeCode` vocabulary is provided; unknown codes
// fall back to a de-camel-cased version of the code so they remain legible
// (and will simply not pair unless they happen to match an XML label).

// Each entry maps a lowercased statTypeCode to [canonical stat, category].
// The canonical stat MUST match the label the XML uses (and the keys in
// STAT_PREFERENCES) or comparable events won't pair. Where the source data
// misspells a word (e.g. "Unsuccesful", "Recoverys"), the XML keeps that
// spelling, so we reproduce it EXACTLY here.
//
// The `stat` and `category` values below are the EXACT `<text>`/`<group>`
// strings used by the master XML (verified against the Chester FC vs Merthyr
// Town FC master: National League North 2026_08). The XML groups its stats
// under just a handful of categories — "Passing", "General Play", "Event",
// "Goal Keeper", "Shots" — so those (not per-stat categories) are reproduced
// here. Getting the `stat` label byte-for-byte right is what lets an event
// pair via STAT_PREFERENCES; a plural mismatch ("Carry" vs "Carries") or a
// stray word ("Header Pass" vs "Header") silently prevents matching.
const STAT_CODE_MAP: Record<string, { stat: string; category: string }> = {
  // --- Passing group ---
  shortpasseffective: { stat: "Short Passes Successful", category: "Passing" },
  shortpassineffective: { stat: "Short Passes Unsuccessful", category: "Passing" },
  longpasseffective: { stat: "Long Passes Successful", category: "Passing" },
  longpassineffective: { stat: "Long Passes Unsuccessful", category: "Passing" },
  throughballeffective: { stat: "Through Balls Successful", category: "Passing" },
  throughballineffective: { stat: "Through Balls Unsuccessful", category: "Passing" },
  // Crosses live in the Passing group; the XML misspells "Unsuccesful" (one 's').
  crosseffective: { stat: "Crosses Successful", category: "Passing" },
  crossineffective: { stat: "Crosses Unsuccesful", category: "Passing" },
  freekickpass: { stat: "Free Kick Passes", category: "Passing" },
  carry: { stat: "Carries", category: "Passing" },
  touch: { stat: "Touch", category: "Passing" },
  // The feed's "Header" is a header (General Play in the XML, not a pass).
  header: { stat: "Header", category: "General Play" },

  // --- Event group (set pieces / restarts; XML pluralises these) ---
  corner: { stat: "Corners", category: "Event" },
  throwin: { stat: "Throw Ins", category: "Event" },
  kickoff: { stat: "Kick Offs", category: "Event" },

  // --- General Play group ---
  dribbleeffective: { stat: "Dribbles Successful", category: "General Play" },
  dribbleineffective: { stat: "Dribbles Unsuccessful", category: "General Play" },
  tackleeffective: { stat: "Tackles Successful", category: "General Play" },
  tackleineffective: { stat: "Tackles Unsuccessful", category: "General Play" },
  ballrecovery: { stat: "Ball Recoverys", category: "General Play" },
  clearance: { stat: "Clearances", category: "General Play" },
  interception: { stat: "Intercepts", category: "General Play" },
  aerialwin: { stat: "Aerial Wins", category: "General Play" },
  foul: { stat: "Fouls", category: "General Play" },
  fouldrawn: { stat: "Fouls Drawn", category: "General Play" },

  // --- Goal Keeper group ---
  save: { stat: "Saves", category: "Goal Keeper" },
  block: { stat: "Blocks", category: "Goal Keeper" },

  // --- Shots group ---
  // NOTE: the feed's generic "shot" (lowercase) and "Goal" both carry
  // statTypeName "Shot in Play"; the XML has no generic in-play shot label,
  // only outcome-specific ones, so a plain "shot" will not pair (expected).
  shotofftarget: { stat: "Shots Off Target", category: "Shots" },
  goal: { stat: "Goals", category: "Shots" },
};

/** Split "ShortPassEffective" -> "Short Pass Effective" for a readable fallback. */
function deCamel(code: string): string {
  return code
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Default stat mapper. Prefers `statTypeCode` (the reliable detail) over the
 * coarse `statTypeName`. Falls back to a de-camel-cased code, then the name.
 */
export function defaultMapStatName(
  statTypeName: string,
  statTypeCode?: string
): string {
  if (statTypeCode) {
    const entry = STAT_CODE_MAP[statTypeCode.toLowerCase()];
    if (entry) return entry.stat;
    // Unknown code: keep it human-readable so it's obvious in the UI/logs.
    return deCamel(statTypeCode);
  }
  return statTypeName ?? "";
}

/**
 * Default category mapper. Uses the STAT_CODE_MAP category for known codes,
 * else falls back to the mapped stat label so breakdowns still group.
 */
export function defaultMapCategory(
  statTypeCode: string | undefined,
  mappedStat: string
): string {
  if (statTypeCode) {
    const entry = STAT_CODE_MAP[statTypeCode.toLowerCase()];
    if (entry) return entry.category;
  }
  return mappedStat;
}

/**
 * Home/Away hint derived from `teamUid` (1 = home, 2 = away by convention).
 * The comparison engine canonicalises team names to Home/Away itself, but the
 * JSON's `teamUid` is an authoritative signal you can use to override the
 * XML's filename-based Home/Away detection when wiring the two together.
 */
export function homeAwayFromTeamUid(
  teamUid: number | undefined
): "home" | "away" | null {
  if (teamUid === 1) return "home";
  if (teamUid === 2) return "away";
  return null;
}
