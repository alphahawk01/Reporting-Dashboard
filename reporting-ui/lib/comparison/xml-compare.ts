// XML comparison engine for SportsCode-style instance exports.
//
// Each XML has <ALL_INSTANCES><instance>... with:
//   <start>seconds</start> <end>seconds</end>
//   <code>Team - #N. N</code>
//   <label><group>Team</group><text>...</text></label>
//   <label><group>Player</group><text>...</text></label>
//   <label><group>{StatCategory}</group><text>{Stat}</text></label>
//
// Master = the correct reference (e.g. "Soccer Comp A").
// Analyst = the one being graded (e.g. "PD Accuracy").

export type Instance = {
  id: string;
  start: number;
  end: number;
  team: string;
  /** jersey number parsed from the code label, e.g. 10 */
  playerNumber: number | null;
  /** raw player label text */
  playerRaw: string;
  /** the stat text, e.g. "Tackles Successful" */
  stat: string;
  /** the stat group/category, e.g. "Tackles" */
  category: string;
  /** original code string */
  code: string;
};

export type MatchStatus =
  | "exact"
  | "wrong_stat" // correct team + player, wrong stat
  | "wrong_player" // correct team, wrong player
  | "wrong_team" // matched in window but different team
  | "missed" // master instance, no analyst instance in window
  | "extra"; // analyst instance with no master match

export type ComparisonRow = {
  status: MatchStatus;
  master: Instance | null;
  analyst: Instance | null;
  /** absolute time delta in seconds between matched instances */
  timeDelta: number | null;
};

export type CategoryBreakdown = {
  category: string;
  total: number;
  exact: number;
  accuracy: number;
};

export type StatBreakdown = {
  /** the individual stat text, e.g. "Hit Out", "Loose Ball Get" */
  stat: string;
  /** master instances of this stat */
  total: number;
  /** exact matches (team + player + stat) */
  exact: number;
  accuracy: number;
};

export type TeamBreakdown = {
  team: string;
  /** number of master instances for this team */
  masterTotal: number;
  exact: number;
  wrongStat: number;
  wrongPlayer: number;
  /** analyst put this team's event on the other team (or vice versa) */
  wrongTeam: number;
  missed: number;
  /** analyst-only instances attributed to this team */
  extra: number;
  /** exact / masterTotal */
  accuracy: number;
  /** average absolute time delta of this team's exact matches */
  avgTimeDrift: number;
};

export type ComparisonResult = {
  rows: ComparisonRow[];
  tolerance: number;
  summary: {
    masterTotal: number;
    analystTotal: number;
    exact: number;
    wrongStat: number;
    wrongPlayer: number;
    wrongTeam: number;
    missed: number;
    extra: number;
    /** exact / masterTotal */
    accuracy: number;
    /** average absolute time delta of exact matches */
    avgTimeDrift: number;
  };
  byCategory: CategoryBreakdown[];
  byStat: StatBreakdown[];
  byTeam: TeamBreakdown[];
};

/** Parse a jersey number out of strings like "St Josephs 10", "10 10", "02 2", "#10". */
function parseNumber(...candidates: string[]): number | null {
  for (const c of candidates) {
    if (!c) continue;
    // Prefer a number after a '#'
    const hash = c.match(/#\s*(\d+)/);
    if (hash) return parseInt(hash[1], 10);
    // Otherwise take the last standalone number in the string
    const all = c.match(/\d+/g);
    if (all && all.length) return parseInt(all[all.length - 1], 10);
  }
  return null;
}

/**
 * Parse a SportsCode XML string into instances.
 * Robust to leading junk, missing groups, and multiple stat labels
 * (first non Team/Player label wins as the stat).
 */
export function parseInstances(xml: string): Instance[] {
  const instances: Instance[] = [];
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // Should only run client-side; guard anyway.
    return instances;
  }
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const nodes = Array.from(doc.getElementsByTagName("instance"));

  for (const node of nodes) {
    const get = (tag: string) =>
      node.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";

    const id = get("ID") || crypto.randomUUID();
    const start = parseFloat(get("start"));
    const end = parseFloat(get("end"));
    const code = get("code");

    let team = "";
    let playerRaw = "";
    let stat = "";
    let category = "";

    const labels = Array.from(node.getElementsByTagName("label"));
    for (const label of labels) {
      const group =
        label.getElementsByTagName("group")[0]?.textContent?.trim() ?? "";
      const text =
        label.getElementsByTagName("text")[0]?.textContent?.trim() ?? "";
      const g = group.toLowerCase();
      if (g === "team") team = text;
      else if (g === "player") playerRaw = text;
      else if (!stat) {
        // First non-meta label is treated as the stat + category.
        category = group;
        stat = text;
      }
    }

    // Fall back to team from code if the Team label was absent.
    if (!team && code.includes(" - #")) team = code.split(" - #")[0].trim();

    const playerNumber = parseNumber(playerRaw, code);

    if (Number.isNaN(start)) continue;

    instances.push({
      id,
      start,
      end: Number.isNaN(end) ? start : end,
      team: team.trim(),
      playerNumber,
      playerRaw,
      stat: stat.trim(),
      category: category.trim(),
      code,
    });
  }

  instances.sort((a, b) => a.start - b.start);
  return instances;
}

function normTeam(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}
function normStat(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Game-flow "events" (centre bounces, around-the-ground bounces, throw-ins)
 * aren't attributed to a specific player/team. If both files log the same
 * event in the same time window, that's a correct match regardless of the
 * player or team recorded against it.
 */
const EVENT_STAT_KEYWORDS = [
  "centre bounce",
  "center bounce",
  "ball up", // around-the-ground bounce is often coded as a ball-up
  "around ground bounce",
  "around the ground bounce",
  "ground bounce",
  "bounce", // catch-all for bounce variants
  "throw in",
  "throw-in",
  "boundary throw", // "Boundary Throws" = boundary throw-in
  "throw", // catch-all for throw variants (boundary throws, throw ins)
];

function isEventStat(stat: string): boolean {
  const s = normStat(stat);
  return EVENT_STAT_KEYWORDS.some((k) => s.includes(k));
}

/**
 * Compare master vs analyst instances.
 * Matching: for each master instance, find the best analyst instance whose
 * start time is within `tolerance` seconds that hasn't been consumed yet.
 * "Best" = the one that agrees on the most fields, then closest in time.
 */
export function compareInstances(
  master: Instance[],
  analyst: Instance[],
  tolerance: number
): ComparisonResult {
  const rows: ComparisonRow[] = [];
  const usedAnalyst = new Set<number>();
  const usedMaster = new Set<number>();

  const fieldsOk = (m: Instance, a: Instance) => {
    const statOk = normStat(m.stat) === normStat(a.stat);
    // Game-flow events aren't tied to a player/team. When the stat matches and
    // it's an event, team/player don't apply, so treat them as agreeing.
    if (statOk && isEventStat(m.stat)) {
      return { teamOk: true, playerOk: true, statOk: true, event: true };
    }
    const teamOk = normTeam(m.team) === normTeam(a.team);
    const playerOk =
      m.playerNumber != null &&
      a.playerNumber != null &&
      m.playerNumber === a.playerNumber;
    return { teamOk, playerOk, statOk, event: false };
  };

  // Match-quality tier (higher = better). The key change: player + stat
  // agreement matters far more than team alone, so a same-team-but-otherwise-
  // wrong pair can't steal an analyst instance from a genuine match.
  //   5 = exact (team + player + stat)
  //   4 = stat + player, wrong team   (same action & player, opposing team)
  //   3 = stat + team,   wrong player (same action, right team, wrong #)
  //   2 = stat only,     wrong team & player (same action, opposing team)
  //   1 = player + team, wrong stat   (same player, different action)
  //   0 = not a plausible match (neither stat nor player agree)
  //
  // A pair is only eligible to match if the STAT matches OR the PLAYER matches.
  // Sharing only the team (e.g. Loose Ball Get vs Ineffective Kick, same team)
  // is NOT the same event, so those aren't paired — the master is "missed" and
  // the analyst is "extra".
  const quality = (m: Instance, a: Instance): number => {
    const { teamOk, playerOk, statOk } = fieldsOk(m, a);
    if (statOk && playerOk && teamOk) return 5;
    if (statOk && playerOk) return 4;
    if (statOk && teamOk) return 3;
    if (statOk) return 2;
    if (playerOk && teamOk) return 1;
    return 0; // ineligible
  };

  // Build every candidate pair within the time tolerance, then assign the
  // best pairs first (global greedy). This avoids the master-order greedy
  // bug where an early weak match consumes an analyst row a later master
  // row needed.
  type Candidate = {
    mi: number;
    ai: number;
    q: number;
    delta: number;
  };
  const candidates: Candidate[] = [];
  for (let mi = 0; mi < master.length; mi++) {
    const m = master[mi];
    for (let ai = 0; ai < analyst.length; ai++) {
      const a = analyst[ai];
      const delta = Math.abs(a.start - m.start);
      if (delta > tolerance) continue;
      const q = quality(m, a);
      if (q === 0) continue; // not a plausible match — skip
      candidates.push({ mi, ai, q, delta });
    }
  }

  // Best first: higher quality wins; ties broken by smaller time delta.
  candidates.sort((x, y) => (y.q - x.q) || (x.delta - y.delta));

  const matchByMaster = new Map<number, { ai: number; delta: number }>();
  for (const c of candidates) {
    if (usedMaster.has(c.mi) || usedAnalyst.has(c.ai)) continue;
    usedMaster.add(c.mi);
    usedAnalyst.add(c.ai);
    matchByMaster.set(c.mi, { ai: c.ai, delta: c.delta });
  }

  // Emit a row for every master instance.
  for (let mi = 0; mi < master.length; mi++) {
    const m = master[mi];
    const match = matchByMaster.get(mi);
    if (!match) {
      rows.push({ status: "missed", master: m, analyst: null, timeDelta: null });
      continue;
    }
    const a = analyst[match.ai];
    const { teamOk, playerOk, statOk } = fieldsOk(m, a);

    // Matched pairs always share stat or player (see quality()).
    let status: MatchStatus;
    if (statOk && playerOk && teamOk) {
      status = "exact";
    } else if (statOk && !teamOk) {
      // Same action credited to the opposing team = wrong team.
      status = "wrong_team";
    } else if (statOk && teamOk && !playerOk) {
      // Same action, right team, wrong jersey number.
      status = "wrong_player";
    } else {
      // Player matches (and team), but the stat/action differs.
      status = "wrong_stat";
    }

    rows.push({ status, master: m, analyst: a, timeDelta: match.delta });
  }

  // Any analyst instance never consumed is an "extra" (false positive).
  for (let i = 0; i < analyst.length; i++) {
    if (usedAnalyst.has(i)) continue;
    rows.push({
      status: "extra",
      master: null,
      analyst: analyst[i],
      timeDelta: null,
    });
  }

  // Sort rows by the timeline (use whichever instance is present).
  rows.sort((r1, r2) => {
    const t1 = r1.master?.start ?? r1.analyst?.start ?? 0;
    const t2 = r2.master?.start ?? r2.analyst?.start ?? 0;
    return t1 - t2;
  });

  // Summary
  const count = (s: MatchStatus) => rows.filter((r) => r.status === s).length;
  const exact = count("exact");
  const wrongStat = count("wrong_stat");
  const wrongPlayer = count("wrong_player");
  const wrongTeam = count("wrong_team");
  const missed = count("missed");
  const extra = count("extra");
  const masterTotal = master.length;
  const analystTotal = analyst.length;

  const exactDeltas = rows
    .filter((r) => r.status === "exact" && r.timeDelta != null)
    .map((r) => r.timeDelta as number);
  const avgTimeDrift =
    exactDeltas.length > 0
      ? exactDeltas.reduce((a, b) => a + b, 0) / exactDeltas.length
      : 0;

  // Per-category accuracy (based on master categories).
  const catMap = new Map<string, { total: number; exact: number }>();
  for (const r of rows) {
    if (!r.master) continue;
    const cat = r.master.category || "Uncategorised";
    const entry = catMap.get(cat) ?? { total: 0, exact: 0 };
    entry.total += 1;
    if (r.status === "exact") entry.exact += 1;
    catMap.set(cat, entry);
  }
  const byCategory: CategoryBreakdown[] = Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      total: v.total,
      exact: v.exact,
      accuracy: v.total > 0 ? v.exact / v.total : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Per-stat accuracy (by the individual stat text, e.g. "Hit Out").
  const statMap = new Map<string, { total: number; exact: number }>();
  for (const r of rows) {
    if (!r.master) continue;
    const stat = r.master.stat || "Uncategorised";
    const entry = statMap.get(stat) ?? { total: 0, exact: 0 };
    entry.total += 1;
    if (r.status === "exact") entry.exact += 1;
    statMap.set(stat, entry);
  }
  const byStat: StatBreakdown[] = Array.from(statMap.entries())
    .map(([stat, v]) => ({
      stat,
      total: v.total,
      exact: v.exact,
      accuracy: v.total > 0 ? v.exact / v.total : 0,
    }))
    .sort((a, b) => a.stat.localeCompare(b.stat));

  // Per-team accuracy. A row is attributed to the master's team, or (for
  // analyst-only "extra" rows) to the analyst's team.
  type TeamAcc = {
    masterTotal: number;
    exact: number;
    wrongStat: number;
    wrongPlayer: number;
    wrongTeam: number;
    missed: number;
    extra: number;
    deltas: number[];
  };
  const teamMap = new Map<string, TeamAcc>();
  const ensureTeam = (name: string): TeamAcc => {
    const key = name || "Unknown";
    let t = teamMap.get(key);
    if (!t) {
      t = {
        masterTotal: 0,
        exact: 0,
        wrongStat: 0,
        wrongPlayer: 0,
        wrongTeam: 0,
        missed: 0,
        extra: 0,
        deltas: [],
      };
      teamMap.set(key, t);
    }
    return t;
  };

  for (const r of rows) {
    if (r.status === "extra") {
      const t = ensureTeam(r.analyst?.team ?? "Unknown");
      t.extra += 1;
      continue;
    }
    const team = r.master?.team ?? r.analyst?.team ?? "Unknown";
    const t = ensureTeam(team);
    t.masterTotal += 1;
    if (r.status === "exact") {
      t.exact += 1;
      if (r.timeDelta != null) t.deltas.push(r.timeDelta);
    } else if (r.status === "wrong_stat") t.wrongStat += 1;
    else if (r.status === "wrong_player") t.wrongPlayer += 1;
    else if (r.status === "wrong_team") t.wrongTeam += 1;
    else if (r.status === "missed") t.missed += 1;
  }

  const byTeam: TeamBreakdown[] = Array.from(teamMap.entries())
    .map(([team, v]) => ({
      team,
      masterTotal: v.masterTotal,
      exact: v.exact,
      wrongStat: v.wrongStat,
      wrongPlayer: v.wrongPlayer,
      wrongTeam: v.wrongTeam,
      missed: v.missed,
      extra: v.extra,
      accuracy: v.masterTotal > 0 ? v.exact / v.masterTotal : 0,
      avgTimeDrift:
        v.deltas.length > 0
          ? v.deltas.reduce((a, b) => a + b, 0) / v.deltas.length
          : 0,
    }))
    .sort((a, b) => b.masterTotal - a.masterTotal);

  return {
    rows,
    tolerance,
    summary: {
      masterTotal,
      analystTotal,
      exact,
      wrongStat,
      wrongPlayer,
      wrongTeam,
      missed,
      extra,
      accuracy: masterTotal > 0 ? exact / masterTotal : 0,
      avgTimeDrift,
    },
    byCategory,
    byStat,
    byTeam,
  };
}

/** Format seconds as mm:ss. */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Parse a time input into seconds. Accepts "mm:ss", "h:mm:ss", or a plain
 * number of seconds. Returns null for empty/invalid input.
 */
export function parseTime(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const parts = t.split(":").map((p) => parseInt(p, 10));
    if (parts.some((n) => Number.isNaN(n))) return null;
    let seconds = 0;
    for (const p of parts) seconds = seconds * 60 + p;
    return seconds;
  }
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}
