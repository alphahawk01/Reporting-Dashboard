// Competition fixtures sourced directly from the S3 competition JSONs.
//
// Each competition is a single object at:
//   https://premierdata01.s3.ap-southeast-2.amazonaws.com/JSON/Comps/c_<uid>.json
//
// The bucket serves these with `Access-Control-Allow-Origin: *`, so they can be
// fetched straight from the browser — no proxy needed. Missing comp ids return
// HTTP 403 (S3's response for a non-existent key), which we treat as "skip".
//
// This is a SEPARATE data path from lib/api/fixtures.ts (the download API +
// Supabase). It powers the standalone /comp-fixtures tab and deliberately does
// not touch the existing /fixtures page.

const COMPS_BASE =
  "https://premierdata01.s3.ap-southeast-2.amazonaws.com/JSON/Comps";

// The known range of competition files (inclusive). Ids outside this range
// return 403. Adjust here if the export range grows.
export const COMP_ID_MIN = 421;
export const COMP_ID_MAX = 859;

// ---------------------------------------------------------------------------
// Source shapes (only the fields we use; the JSON has many more).
// ---------------------------------------------------------------------------

/** A match/highlight video reference on a fixture summary. */
type CompVideo = {
  videoFileName?: string;
  videoName?: string;
  videoType?: string;
};

/** The final score block on a played fixture. */
type CompResult = {
  homeFT?: number;
  awayFT?: number;
  homeFG?: number;
  homeFB?: number;
  awayFG?: number;
  awayFB?: number;
};

/** One fixture as it appears under allRounds[].allFixtureSummaries[]. */
export type CompFixtureSummary = {
  uid: number;
  round?: string;
  description?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeTeamUid?: number;
  awayTeamUid?: number;
  homeClubUid?: number;
  awayClubUid?: number;
  fixtureDate?: string; // "dd/MM/yyyy"
  fixtureTime?: string;
  isFinal?: boolean;
  myResult?: CompResult;
  myMatchVideo?: CompVideo;
  myHighlightVideo?: CompVideo;
};

type CompRound = {
  allFixtureSummaries?: CompFixtureSummary[];
};

/** The top-level competition object (only fields we surface). */
export type Competition = {
  uid: number;
  name?: string;
  season?: number;
  sportName?: string;
  currentRound?: string;
  allRounds?: CompRound[];
};

// ---------------------------------------------------------------------------
// Flattened fixture shape consumed by the /comp-fixtures page.
// ---------------------------------------------------------------------------

/**
 * A single fixture, flattened out of a competition JSON. Field names mirror the
 * conventions used elsewhere in the app (home_team/away_team/game_key) so this
 * could later be matched against the existing fixtures if desired.
 */
export type CompFixture = {
  /** Composite id, unique across comps: "<compUid>:<fixtureUid>". */
  id: string;
  /** The fixture's own uid within the competition. */
  fixtureUid: number;
  competitionUid: number;
  competition: string;
  season: number | null;
  sport: string;
  round: string;
  date: string; // as provided, "dd/MM/yyyy"
  time: string;
  /** Sortable timestamp parsed from date+time (ms), or null if unparseable. */
  dateMs: number | null;
  home_team: string;
  away_team: string;
  homeTeamUid: number | null;
  awayTeamUid: number | null;
  isFinal: boolean;
  /** Final score "62 - 50" when a result exists, else "". */
  score: string;
  videoURL: string;
  videoName: string;
  /**
   * The cross-system composite key used elsewhere to match fixtures:
   * home|away|competition|round, normalised (lowercased, whitespace-collapsed).
   */
  game_key: string;
};

// Normalise a key part the SAME way the existing fixtures page does, so a
// game_key produced here would match one produced there. Exported so team-name
// matching (linking comp teams to the `teams` table) uses identical rules.
export function normaliseKeyPart(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Parse "dd/MM/yyyy" (+ optional "HH:mm" time) into epoch ms, or null.
function parseFixtureDate(date?: string, time?: string): number | null {
  if (!date) return null;
  const dm = date.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dm) return null;
  const day = Number(dm[1]);
  const month = Number(dm[2]);
  const year = Number(dm[3]);
  let hh = 0;
  let mm = 0;
  const tm = (time ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (tm) {
    hh = Number(tm[1]);
    mm = Number(tm[2]);
  }
  const ms = Date.UTC(year, month - 1, day, hh, mm);
  return Number.isFinite(ms) ? ms : null;
}

// Competitions whose NAME contains any of these words are excluded entirely —
// they're internal/non-real comps (practice sessions, test comps, accuracy
// checks), not fixtures anyone schedules. Matched case-insensitively as
// substrings. Filtered at the source so they never enter the database.
const EXCLUDED_COMP_KEYWORDS = ["practice", "test", "accuracy"];

/** True when a competition name is an internal/non-real comp to skip. */
export function isExcludedCompetition(name: string | null | undefined): boolean {
  const n = (name ?? "").toLowerCase();
  return EXCLUDED_COMP_KEYWORDS.some((k) => n.includes(k));
}

/** Turn one competition object into a flat list of fixtures. */
export function compToFixtures(comp: Competition): CompFixture[] {
  const out: CompFixture[] = [];
  const competition = (comp.name ?? "").trim();
  // Skip whole competitions flagged as internal/non-real (practice/test/etc).
  if (isExcludedCompetition(competition)) return out;
  const season = typeof comp.season === "number" ? comp.season : null;
  const sport = (comp.sportName ?? "").trim();

  for (const round of comp.allRounds ?? []) {
    for (const f of round.allFixtureSummaries ?? []) {
      const home = (f.homeTeam ?? "").trim();
      const away = (f.awayTeam ?? "").trim();
      // Skip placeholder/empty fixtures (no teams = not a real match row).
      if (!home && !away) continue;

      const roundStr = (f.round ?? "").trim();
      const date = (f.fixtureDate ?? "").trim();
      const time = (f.fixtureTime ?? "").trim();

      const hasResult =
        f.myResult != null &&
        (typeof f.myResult.homeFT === "number" ||
          typeof f.myResult.awayFT === "number");
      const score = hasResult
        ? `${f.myResult?.homeFT ?? 0} - ${f.myResult?.awayFT ?? 0}`
        : "";

      const videoURL = (f.myMatchVideo?.videoFileName ?? "").trim();

      out.push({
        id: `${comp.uid}:${f.uid}`,
        fixtureUid: f.uid,
        competitionUid: comp.uid,
        competition,
        season,
        sport,
        round: roundStr,
        date,
        time,
        dateMs: parseFixtureDate(date, time),
        home_team: home,
        away_team: away,
        homeTeamUid:
          typeof f.homeTeamUid === "number" ? f.homeTeamUid : null,
        awayTeamUid:
          typeof f.awayTeamUid === "number" ? f.awayTeamUid : null,
        isFinal: f.isFinal === true,
        score,
        videoURL,
        videoName: (f.myMatchVideo?.videoName ?? "").trim(),
        game_key: [
          normaliseKeyPart(home),
          normaliseKeyPart(away),
          normaliseKeyPart(competition),
          normaliseKeyPart(roundStr),
        ].join("|"),
      });
    }
  }
  return out;
}

/**
 * Fetch one competition JSON by uid. Returns null when the file doesn't exist
 * (S3 answers 403 for a missing key) or the body isn't valid JSON, so callers
 * can simply skip it. Throws only on unexpected network failures the caller may
 * want to surface.
 */
export async function fetchCompetition(
  uid: number,
  signal?: AbortSignal
): Promise<Competition | null> {
  const res = await fetch(`${COMPS_BASE}/c_${uid}.json`, {
    cache: "no-store",
    signal,
  });
  // 403 (missing key) / 404 → this id simply has no competition file.
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed loading competition ${uid} (${res.status}).`);
  }
  try {
    const json = (await res.json()) as Competition;
    if (!json || typeof json.uid !== "number") return null;
    return json;
  } catch {
    return null;
  }
}

/** Result of a metadata-aware comp fetch (used by the Supabase sync). */
export type CompFetchResult = {
  /** "ok" = file exists and parsed; "missing" = 403/404; "error" = other. */
  status: "ok" | "missing" | "error";
  competition: Competition | null;
  /** The S3 object's Last-Modified header, when present. */
  lastModified: string | null;
};

/**
 * Fetch a competition AND its S3 Last-Modified header, classifying the outcome
 * so the sync layer can tell a missing id (403) from a real error and can
 * detect changes via Last-Modified. Never throws for the missing/error cases —
 * they're returned as statuses so a batch sync can continue.
 */
export async function fetchCompetitionWithMeta(
  uid: number,
  signal?: AbortSignal
): Promise<CompFetchResult> {
  try {
    const res = await fetch(`${COMPS_BASE}/c_${uid}.json`, {
      cache: "no-store",
      signal,
    });
    if (res.status === 403 || res.status === 404) {
      return { status: "missing", competition: null, lastModified: null };
    }
    if (!res.ok) {
      return { status: "error", competition: null, lastModified: null };
    }
    const lastModified = res.headers.get("last-modified");
    const json = (await res.json()) as Competition;
    if (!json || typeof json.uid !== "number") {
      return { status: "error", competition: null, lastModified };
    }
    return { status: "ok", competition: json, lastModified };
  } catch {
    return { status: "error", competition: null, lastModified: null };
  }
}

/** HEAD a competition file to read its Last-Modified without downloading it. */
export async function headCompetition(
  uid: number,
  signal?: AbortSignal
): Promise<{ status: "ok" | "missing" | "error"; lastModified: string | null }> {
  try {
    const res = await fetch(`${COMPS_BASE}/c_${uid}.json`, {
      method: "HEAD",
      cache: "no-store",
      signal,
    });
    if (res.status === 403 || res.status === 404) {
      return { status: "missing", lastModified: null };
    }
    if (!res.ok) return { status: "error", lastModified: null };
    return { status: "ok", lastModified: res.headers.get("last-modified") };
  } catch {
    return { status: "error", lastModified: null };
  }
}

export type CompFetchProgress = {
  /** Ids attempted so far. */
  done: number;
  /** Total ids in the range. */
  total: number;
  /** Competitions successfully loaded so far. */
  found: number;
};

/**
 * Fetch every competition in [COMP_ID_MIN, COMP_ID_MAX] and flatten to
 * fixtures. Requests run with a bounded concurrency so the browser isn't
 * flooded with ~440 simultaneous connections. Missing ids (403) are skipped.
 *
 * `onProgress` is called as ids complete, for a live progress bar. Returns the
 * fixtures (sorted newest-first) and the competitions that were found.
 */
export async function fetchAllCompFixtures(opts?: {
  onProgress?: (p: CompFetchProgress) => void;
  concurrency?: number;
  signal?: AbortSignal;
  min?: number;
  max?: number;
}): Promise<{ fixtures: CompFixture[]; competitions: Competition[] }> {
  const min = opts?.min ?? COMP_ID_MIN;
  const max = opts?.max ?? COMP_ID_MAX;
  const concurrency = Math.max(1, opts?.concurrency ?? 8);
  const ids: number[] = [];
  for (let i = min; i <= max; i++) ids.push(i);

  const total = ids.length;
  let done = 0;
  const competitions: Competition[] = [];

  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      if (opts?.signal?.aborted) return;
      const uid = ids[cursor++];
      try {
        const comp = await fetchCompetition(uid, opts?.signal);
        if (comp) competitions.push(comp);
      } catch {
        // Network hiccup for a single id: skip it rather than fail the batch.
      } finally {
        done += 1;
        opts?.onProgress?.({ done, total, found: competitions.length });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length) }, () => worker())
  );

  // Sort comps by uid for a stable order, then flatten.
  competitions.sort((a, b) => a.uid - b.uid);
  const fixtures = competitions.flatMap(compToFixtures);
  // Newest fixtures first; undated ones sink to the bottom.
  fixtures.sort((a, b) => (b.dateMs ?? -Infinity) - (a.dateMs ?? -Infinity));

  return { fixtures, competitions };
}
