// Fixtures for the Fixture Review page. This is a thin, purpose-built read over
// the AutoDownload API's /api/fixtures that returns only what the review UI
// needs: a display title, the video URL to play, and (when the JADE sync has
// populated it) the JADE fixture uid used to locate the S3 stat timeline
// (Reports{jadeFixtureUid}.json).
//
// It's kept separate from lib/api/fixtures.ts on purpose: getFixtures() has a
// specific shape consumed across several pages, and reshaping it is risky.

const API_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5165"
    : "https://downloads.premierdata-technology.com";

export interface ReviewFixture {
  /**
   * Fixture id. When sourced from comp_fixtures this is the composite
   * "compUid:fixtureUid" string; when from the AutoDownload API it's the
   * numeric PostgreSQL id as a string. Used only as a React key / selection id.
   */
  id: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  round: string;
  date: string;
  /** Sport (e.g. "Australian Rules Football", "Soccer"), when known. */
  sport: string;
  /** Season year (e.g. 2026), when known. */
  season: number | null;
  /** Direct video URL (mp4) for the match, if available. */
  videoUrl: string;
  /**
   * JADE fixture uid — the id used in the S3 report path
   * (JSON/Fixture/Reports{jadeFixtureUid}.json). From comp_fixtures this is
   * parsed directly from the id ("compUid:fixtureUid"); null when unknown.
   */
  jadeFixtureUid: number | null;
  /** Whether the match has a video URL to play. */
  hasVideo: boolean;
}

/**
 * Load fixtures for the review picker from Supabase comp_fixtures, scoped by
 * sport / season / date range (the same source + filters as the Comp Fixtures
 * page). This is the primary loader: comp_fixtures carries sport, season,
 * fixture_date and video_url, and its id ("compUid:fixtureUid") yields the JADE
 * fixture uid directly — so the timeline needs no video-URL lookup.
 */
export async function getReviewFixturesFromComps(filters: {
  sport?: string;
  season?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  /**
   * When true, return ONLY "Accuracy" comps (the analyst-coded games). When
   * false/omitted, accuracy comps are hidden (the normal fixture views). Used
   * by the analyst picker on the Fixture Accuracy tool.
   */
  accuracyOnly?: boolean;
}): Promise<ReviewFixture[]> {
  const { queryCompFixtures } = await import("./compFixtures");
  const rows = await queryCompFixtures({
    sport: filters.sport,
    season: filters.season ?? undefined,
    dateFrom: filters.dateFrom ?? undefined,
    dateTo: filters.dateTo ?? undefined,
    accuracyOnly: filters.accuracyOnly,
  });

  return rows.map((r) => {
    // id is "compUid:fixtureUid" — the part after ':' is the JADE fixture uid.
    const uidPart = r.id.includes(":") ? r.id.split(":")[1] : "";
    const jadeUid = Number(uidPart);
    const videoUrl = (r.video_url ?? "").trim();
    return {
      id: r.id,
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      competition: r.competition,
      round: r.round,
      date: r.fixture_date ?? "",
      sport: r.sport,
      season: r.season,
      videoUrl,
      jadeFixtureUid: Number.isFinite(jadeUid) && jadeUid > 0 ? jadeUid : null,
      hasVideo: videoUrl.length > 0,
    };
  });
}

/** Human title for a fixture, e.g. "APS Round 11 - Brighton Grammar vs Geelong College". */
export function fixtureTitle(f: ReviewFixture): string {
  const teams = `${f.homeTeam} vs ${f.awayTeam}`;
  const comp = [f.competition, f.round ? `Round ${f.round}` : ""]
    .filter(Boolean)
    .join(" ");
  return comp ? `${comp} - ${teams}` : teams;
}

/**
 * Load fixtures for the review picker. Returns them sorted by most recent date
 * first, with a display-ready shape. Throws on a failed request so the page can
 * surface an "API unreachable" state (mirroring the other fixture pages).
 */
export async function getReviewFixtures(): Promise<ReviewFixture[]> {
  const res = await fetch(`${API_URL}/api/fixtures`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed loading fixtures (HTTP ${res.status})`);
  }

  const data = await res.json();
  const rows: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.value)
      ? data.value
      : [];

  const fixtures: ReviewFixture[] = rows.map((raw) => {
    const f = raw as Record<string, unknown>;
    const videoUrl = String(f.videoUrl ?? "").trim();
    // jadeFixtureUid arrives once the backend sync populates it; tolerate its
    // absence (older API build) by defaulting to null.
    const jadeRaw = f.jadeFixtureUid;
    const jadeFixtureUid =
      jadeRaw == null || jadeRaw === "" ? null : Number(jadeRaw);

    return {
      id: String(f.id ?? ""),
      homeTeam: String(f.homeTeam ?? ""),
      awayTeam: String(f.awayTeam ?? ""),
      competition: String(f.leagueName ?? "").trim(),
      round: String(f.round ?? "").trim(),
      date: String(f.date ?? ""),
      sport: "",
      season: null,
      videoUrl,
      jadeFixtureUid: Number.isFinite(jadeFixtureUid as number)
        ? (jadeFixtureUid as number)
        : null,
      hasVideo: videoUrl.length > 0,
    };
  });

  // Most recent first (date is an ISO-ish string from the API).
  return fixtures.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
