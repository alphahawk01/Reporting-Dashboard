// Types for the Premier Data fixture "report" JSON stored in S3 at
//   s3://premierdata01/JSON/Fixture/Reports{FixtureID}.json
// served publicly over HTTPS at
//   https://premierdata01.s3.ap-southeast-2.amazonaws.com/JSON/Fixture/Reports{FixtureID}.json
//
// The file is a full match report. The FULL EVENT TIMELINE is the top-level
// `allStatistics` array: one timestamped on-field action per element, ordered
// through the game. The other arrays are aggregates (see below) and are typed
// loosely because the dashboard's timeline use-case only needs the event stream
// plus fixture metadata.

// One on-field action in the fixture timeline. Every stat event carries a
// quarter + relativeTime (seconds from the start of play), the player/team who
// performed it, the stat type, and field-location coordinates.
export interface FixtureStatEvent {
  /** Quarter number (1–4). */
  quarter: number;
  /** Seconds from the start of play — the timeline position of this event. */
  relativeTime: number;
  /** Machine stat code, e.g. "HitOut", "EffectiveKick". */
  statTypeCode: string;
  /** Human stat name, e.g. "Hit Out", "Effective Kick". */
  statTypeName: string;
  /** Display name of the player who performed the action. */
  playerName: string;
  playerUid: number;
  /**
   * Jumper number of the player, joined from allParticipants by playerUid at
   * parse time (the raw stat event has no number field). Null when the player
   * isn't in the participants list or has no number.
   */
  playerNumber: number | null;
  /** Team name + uid the action is attributed to. */
  teamName: string;
  teamUid: number;
  /** Field-location coordinates (0 when not captured for this stat type). */
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  /**
   * Grid dimensions the start/end cells are indexed within (soccer ~10 × 8).
   * startX/startY are 1-based cells inside this grid. 0 when no location was
   * captured. The end cells share the start grid's dimensions.
   */
  startWidth: number;
  startHeight: number;
  endWidth: number;
  endHeight: number;
  /** Coarse field zone. */
  zone: number;
  groundSide: string;
  /** Common qualifier flags. */
  contested: boolean;
  effective: boolean;
  turnover: boolean;
  deep: boolean;
  /** Error tracking on the stat (0 / empty when clean). */
  errorCode: number;
  errorReason: string;
  errorOverride: boolean;
  /** Analyst who logged it (initials) and free-text notes, when present. */
  analystInitials: string;
  notes: string;
  /** Stable identifier for the event within the fixture. */
  uid: number;
  // Additional raw fields exist on each record (preBuffer, postBuffer,
  // instantiated, ss_* etc.); they're preserved via the index signature below
  // rather than enumerated, since the timeline view doesn't consume them.
  [key: string]: unknown;
}

// One row of a player's stat breakdown: a stat's count in a given quarter.
export interface RawPlayerStatEntry {
  statType: string;
  statName: string;
  /** 1–4 per quarter; 5 = whole-game total. */
  quarter: number;
  score: number;
}

// A player's full stat breakdown from allPlayerStats[].
export interface RawPlayerStats {
  playerUid: number;
  playerNumber: number;
  playerName: string;
  teamUid: number;
  teamName: string;
  allStatistics: RawPlayerStatEntry[];
}

// A match participant. Only the fields the timeline join needs are typed; the
// raw record has many more (rotations, position, quarter %s, etc.).
export interface FixtureParticipant {
  playerUid: number;
  playerNumber: number;
  playerName: string;
  teamUid: number;
  [key: string]: unknown;
}

// Fixture-level metadata carried alongside the timeline.
export interface FixtureMeta {
  /** Fixture ID — matches the {FixtureID} in the S3 path. */
  uid: number;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamUid: number;
  awayTeamUid: number;
  competitionUid: number;
  /** As stored in the file: "DD/MM/YYYY" and "HH:mm". */
  fixtureDate: string;
  fixtureTime: string;
  round: string;
  venue: string;
  isFinal: boolean;
  isLive: boolean;
  isStarted: boolean;
}

// The raw report object. Only the fields the timeline view relies on are typed;
// everything else is left open so we never fight the source schema.
export interface FixtureReport extends FixtureMeta {
  /** THE event timeline. */
  allStatistics: FixtureStatEvent[];
  /** Aggregated running scoreboard summaries (not the event timeline). */
  allStatSummarys?: unknown[];
  /**
   * Per-player rolled-up stat lines. Each entry has the player's identity plus
   * an allStatistics array of { statType, quarter, score } (quarter 5 = total).
   * Parsed into PlayerStatLine[] for the Player Stats view.
   */
  allPlayerStats?: RawPlayerStats[];
  /** Shots on goal. */
  allShotSummarys?: unknown[];
  /**
   * Match participants — players in the game. Carries playerUid + playerNumber,
   * which is the only place a jumper number lives (stat events don't have one),
   * so the timeline joins on playerUid to attach playerNumber.
   */
  allParticipants?: FixtureParticipant[];
  /** Coach video reports + segment annotations (video-timecode based). */
  allCoachReports?: unknown[];
  [key: string]: unknown;
}

// ── Per-player stat totals ────────────────────────────────────────────────
// JADE's allPlayerStats[] gives each player a breakdown of every stat by
// quarter. Each entry is { statType, quarter, score } where quarter 1–4 are the
// per-quarter counts and quarter 5 is the whole-game TOTAL. We surface the
// common AFL columns (matching the software's Player Stats view).

// The set of quarters we expose: 1–4 plus 5 (=Total).
export type StatQuarter = 1 | 2 | 3 | 4 | 5;

// One player's stat line, with per-quarter values for each column. Index each
// column by quarter (1–5) to read that quarter's value; 5 is the game total.
export interface PlayerStatLine {
  playerUid: number;
  playerNumber: number;
  playerName: string;
  teamUid: number;
  teamName: string;
  /**
   * columns[colKey][quarter] = value. colKey is one of the STAT_COLUMNS keys
   * (k, hb, d, cp, m, i50, r50, onePct, t, ci, g, rp). Missing values are 0.
   */
  columns: Record<string, Record<StatQuarter, number>>;
}

// A cleaned-up timeline result: fixture metadata + the events sorted into
// chronological order (by quarter, then relativeTime).
export interface FixtureTimeline {
  fixtureId: number;
  meta: FixtureMeta;
  /** Events in chronological order. */
  events: FixtureStatEvent[];
  /** Total number of events in the timeline. */
  eventCount: number;
  /** Per-player stat totals (from allPlayerStats), for the Player Stats view. */
  players: PlayerStatLine[];
  /** Sport of the fixture (drives which Player Stats columns are shown). */
  sport: string | null;
}
