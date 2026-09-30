// Resolve a platform fixture to its JADE fixture uid (needed to locate the S3
// stat report, Reports{jadeUid}.json) by matching on the match video URL.
//
// Why the video URL: the platform fixture and the JADE competition export both
// carry the same match video filename (JADE's
// allFixtureSummaries[].myMatchVideo.videoFileName == the platform fixture's
// videoUrl). JADE also gives that fixture's uid alongside it, so the video URL
// is a reliable join key between the two systems. (This is a UI-side stopgap;
// the backend JADE sync will eventually store jadeFixtureUid on the fixture
// directly, making this lookup unnecessary.)
//
// Competition files are large, so a resolve fetches ONE competition file (by
// its comp id) rather than scanning all ~424. Callers pass the comp id from the
// JADE competition map document (docs/jade-competition-map.md).

const COMPS_BASE =
  "https://premierdata01.s3.ap-southeast-2.amazonaws.com/JSON/Comps";

// Normalise a video URL for comparison between the two systems. The platform
// stores URL-encoded paths (spaces as %20, e.g. ".../Geelong%20FNL/...") while
// JADE's export keeps literal spaces (".../Geelong FNL/..."), so an exact
// string compare never matches. Decoding + lowercasing makes the two forms
// equal. decodeURIComponent can throw on malformed input, so fall back to the
// raw string in that case.
function normaliseVideoUrl(url: string): string {
  const trimmed = (url ?? "").trim();
  try {
    return decodeURIComponent(trimmed).toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

// Minimal shape of the bits of a competition export we read.
interface JadeCompFile {
  name?: string;
  allRounds?: {
    allFixtureSummaries?: {
      uid?: number;
      myMatchVideo?: { videoFileName?: string };
    }[];
  }[];
}

/** One (video URL → JADE fixture uid) mapping extracted from a comp file. */
export interface JadeVideoMapping {
  jadeFixtureUid: number;
  videoUrl: string;
}

/**
 * Fetch one JADE competition export and return every fixture's
 * (matchVideoUrl → jadeFixtureUid) pair. Throws on fetch/parse failure so the
 * caller can fall back to manual id entry.
 */
export async function getCompVideoMap(
  compId: number | string
): Promise<JadeVideoMapping[]> {
  const url = `${COMPS_BASE}/c_${compId}.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed loading competition ${compId} (HTTP ${res.status})`);
  }
  const data = (await res.json()) as JadeCompFile;

  const out: JadeVideoMapping[] = [];
  for (const round of data.allRounds ?? []) {
    for (const fx of round.allFixtureSummaries ?? []) {
      const video = fx.myMatchVideo?.videoFileName?.trim();
      if (fx.uid && video) {
        out.push({ jadeFixtureUid: fx.uid, videoUrl: video });
      }
    }
  }
  return out;
}

/**
 * Given a platform fixture's video URL and a competition id, resolve the JADE
 * fixture uid by matching the video URL within that competition. Returns null
 * when the competition can't be read or the URL isn't found (e.g. the fixture
 * belongs to a different competition, or the match isn't in JADE yet).
 */
export async function resolveJadeUidByVideo(
  videoUrl: string,
  compId: number | string
): Promise<number | null> {
  const target = normaliseVideoUrl(videoUrl);
  if (!target) return null;
  try {
    const mappings = await getCompVideoMap(compId);
    const hit = mappings.find(
      (m) => normaliseVideoUrl(m.videoUrl) === target
    );
    return hit?.jadeFixtureUid ?? null;
  } catch {
    return null;
  }
}
