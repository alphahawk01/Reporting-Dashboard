// Player Accuracy — analyst's coded VOLUME vs the master's, grouped into
// Overall / Passing / Offensive / Defensive / Goalkeeper, using an
// absolute-difference method:
//
//   Each component stat is compared on its OWN |analyst - master|, and those
//   per-stat absolute errors are summed BEFORE computing the %. This is
//   deliberate: an over-count on one stat must not cancel an under-count on
//   another (e.g. +8 tackles cancelling -13 ball recoveries). The % is
//   (master - Σ|diff|) / master, floored at 0 and capped at 100%.
//
// This module is the single source of truth for that calculation so the
// Accuracy Comparison page and the Accuracy History "Checks by master
// fixture" table stay identical. Football only for now (AFL added later).

import type { ComparisonRow } from "./xml-compare";

// Open string->number map of football stat counts.
export type FootballCounts = Record<string, number>;

// Zeroed football counts.
export function initFootballCounts(): FootballCounts {
  return {
    shortPassSucc: 0,
    shortPassUnsucc: 0,
    longPassSucc: 0,
    longPassUnsucc: 0,
    throughSucc: 0,
    throughUnsucc: 0,
    crossSucc: 0,
    crossUnsucc: 0,
    touches: 0,
    carries: 0,
    shots: 0,
    goals: 0,
    tacklesSucc: 0,
    tacklesUnsucc: 0,
    dribblesSucc: 0,
    dribblesUnsucc: 0,
    interceptions: 0,
    clearances: 0,
    blocks: 0,
    ballRecoveries: 0,
    groundDuelsWon: 0,
    groundDuelsLost: 0,
    aerialWon: 0,
    aerialLost: 0,
    headers: 0,
    fouls: 0,
    foulsDrawn: 0,
    // Goalkeeper
    gkSaves: 0,
    gkBlocks: 0,
    gkCatches: 0,
    gkClaims: 0,
    gkPunches: 0,
    gkGoalKicks: 0,
    gkThrows: 0,
  };
}

// Classify one lowercased stat label into the counts. Keyword matches follow
// the actual football XML labels (e.g. "Short Passes Successful", "Crosses
// Unsuccesful" — the source misspells it with one 's').
export function bumpFootball(c: FootballCounts, s: string): void {
  // Goalkeeper first — some labels contain words later checks would swallow
  // (e.g. "Goal Kick" contains "goal"/"kick", keeper throws are distinct).
  if (s.includes("save")) c.gkSaves += 1;
  // "Blocked Shot" is a goalkeeper stat. A plain "Block" is a defender stat
  // (handled below in the defensive section), so match the GK phrase only.
  else if (s.includes("blocked shot")) c.gkBlocks += 1;
  else if (s.includes("catch")) c.gkCatches += 1;
  else if (s.includes("claim")) c.gkClaims += 1;
  else if (s.includes("punch")) c.gkPunches += 1;
  else if (s.includes("goal kick")) c.gkGoalKicks += 1;
  else if (
    (s.includes("keeper") || s.includes("goalkeeper")) &&
    s.includes("throw")
  )
    c.gkThrows += 1;
  // Shots & goals (before generic pass/cross checks).
  else if (s.includes("goal") && !s.includes("goal kick")) c.goals += 1;
  else if (s.includes("shot")) c.shots += 1;
  // Passing
  else if (s.includes("short pass") && s.includes("unsuccessful"))
    c.shortPassUnsucc += 1;
  else if (s.includes("short pass") && s.includes("successful"))
    c.shortPassSucc += 1;
  else if (s.includes("long pass") && s.includes("unsuccessful"))
    c.longPassUnsucc += 1;
  else if (s.includes("long pass") && s.includes("successful"))
    c.longPassSucc += 1;
  else if (s.includes("through ball") && s.includes("unsuccessful"))
    c.throughUnsucc += 1;
  else if (s.includes("through ball") && s.includes("successful"))
    c.throughSucc += 1;
  // Crosses — source misspells "Unsuccesful" (one 's'), so match both.
  else if (
    s.includes("cross") &&
    (s.includes("unsuccessful") || s.includes("unsuccesful"))
  )
    c.crossUnsucc += 1;
  else if (s.includes("cross") && s.includes("successful")) c.crossSucc += 1;
  // On-ball
  else if (s.includes("touch")) c.touches += 1;
  else if (s.includes("carr")) c.carries += 1;
  // Defensive / duels
  else if (s.includes("tackle") && s.includes("unsuccessful"))
    c.tacklesUnsucc += 1;
  else if (s.includes("tackle") && s.includes("successful"))
    c.tacklesSucc += 1;
  else if (s.includes("dribble") && s.includes("unsuccessful"))
    c.dribblesUnsucc += 1;
  else if (s.includes("dribble") && s.includes("successful"))
    c.dribblesSucc += 1;
  else if (s.includes("intercept")) c.interceptions += 1;
  else if (s.includes("clearance")) c.clearances += 1;
  else if (s.includes("block")) c.blocks += 1; // outfield defensive block
  else if (s.includes("ball recover")) c.ballRecoveries += 1;
  else if (s.includes("ground duels won")) c.groundDuelsWon += 1;
  else if (s.includes("ground duels lost")) c.groundDuelsLost += 1;
  else if (s.includes("aerial win")) c.aerialWon += 1;
  else if (s.includes("aerial loss")) c.aerialLost += 1;
  else if (s.includes("header")) c.headers += 1;
  else if (s.includes("fouls drawn")) c.foulsDrawn += 1;
  else if (s.includes("foul")) c.fouls += 1;
}

// Add derived aggregate keys (totalPasses, crosses, tackles) used by groups.
export function deriveFootball(c: FootballCounts): FootballCounts {
  return {
    ...c,
    totalPasses:
      c.shortPassSucc +
      c.longPassSucc +
      c.throughSucc +
      c.shortPassUnsucc +
      c.longPassUnsucc +
      c.throughUnsucc,
    // Short + long passes only (excludes through balls) so the Passing group
    // can list through balls as a separate line without double-counting.
    passesExThrough:
      c.shortPassSucc +
      c.longPassSucc +
      c.shortPassUnsucc +
      c.longPassUnsucc,
    // Successful / unsuccessful passes, excluding through balls (which are a
    // separate Passing line). Lets Passing split into succ vs unsucc.
    passSuccExThrough: c.shortPassSucc + c.longPassSucc,
    passUnsuccExThrough: c.shortPassUnsucc + c.longPassUnsucc,
    totalThroughBalls: c.throughSucc + c.throughUnsucc,
    crosses: c.crossSucc + c.crossUnsucc,
    tackles: c.tacklesSucc + c.tacklesUnsucc,
    dribbles: c.dribblesSucc + c.dribblesUnsucc,
    groundDuels: c.groundDuelsWon + c.groundDuelsLost,
    aerialDuels: c.aerialWon + c.aerialLost,
  };
}

// A group is a set of derived football keys shown together as one card/column.
export type AccuracyGroupDef = {
  label: string;
  parts: readonly { key: string; label: string }[];
};

// The four football groups. Order matters for display.
export const FOOTBALL_GROUPS = {
  passing: {
    label: "Passing",
    parts: [
      { key: "passSuccExThrough", label: "Pass succ" },
      { key: "passUnsuccExThrough", label: "Pass unsucc" },
      { key: "totalThroughBalls", label: "Through balls" },
      { key: "crosses", label: "Crosses" },
    ],
  },
  offensive: {
    label: "Offensive",
    parts: [
      { key: "shots", label: "Shots" },
      { key: "goals", label: "Goals" },
      { key: "dribbles", label: "Dribbles" },
    ],
  },
  defensive: {
    label: "Defensive",
    parts: [
      { key: "tackles", label: "Tackles" },
      { key: "interceptions", label: "Interceptions" },
      { key: "clearances", label: "Clearances" },
      { key: "blocks", label: "Blocks" },
      { key: "ballRecoveries", label: "Ball recoveries" },
      { key: "groundDuels", label: "Ground duels" },
      { key: "aerialDuels", label: "Aerial duels" },
    ],
  },
  goalkeeper: {
    label: "Goalkeeper",
    parts: [
      { key: "gkSaves", label: "Saves" },
      { key: "gkBlocks", label: "Blocked shots" },
      { key: "gkCatches", label: "Catches" },
      { key: "gkClaims", label: "Claims" },
      { key: "gkPunches", label: "Punches" },
      { key: "gkGoalKicks", label: "Goal kicks" },
      { key: "gkThrows", label: "Keeper throws" },
    ],
  },
} as const;

// One component stat within a group. Player accuracy is EXACT-match based:
//   master = master instances of this stat in scope
//   exact  = of those, how many the analyst matched exactly (team + player +
//            stat + timing all agree)
export type AccuracyPart = {
  label: string;
  master: number;
  exact: number;
};

// A computed group result. `pct` is exact / master (event-level accuracy) —
// the true indicator of player accuracy, matching the stats breakdown table.
export type AccuracyGroup = {
  master: number;
  exact: number;
  /** exact / master, or 1 when master is 0. */
  pct: number;
  parts: AccuracyPart[];
};

export type PlayerAccuracy = {
  overall: AccuracyGroup;
  passing: AccuracyGroup;
  offensive: AccuracyGroup;
  defensive: AccuracyGroup;
  goalkeeper: AccuracyGroup;
};

// Which derived football key does a single (lowercased) stat increment?
// Runs the classifier on just this stat, then finds the first derived key
// with a positive count. Used to map a raw stat label to a group part.
function statDerivedKeys(statLower: string): Set<string> {
  const c = initFootballCounts();
  bumpFootball(c, statLower);
  const d = deriveFootball(c);
  const keys = new Set<string>();
  for (const k of Object.keys(d)) if ((d[k] ?? 0) > 0) keys.add(k);
  return keys;
}

// Map a stat label to the part key within a group whose derived key it
// increments. Returns null when the stat doesn't belong to the group.
function partKeyForStat(
  group: AccuracyGroupDef,
  statLower: string
): string | null {
  const keys = statDerivedKeys(statLower);
  for (const p of group.parts) if (keys.has(p.key)) return p.key;
  return null;
}

// Build one group's EXACT-match result from the scoped comparison rows.
// For every master instance whose stat belongs to this group, count it in the
// matching part's `master`; if the row is an exact match, also count `exact`.
function buildGroup(
  group: AccuracyGroupDef,
  rows: ComparisonRow[]
): AccuracyGroup {
  const parts = group.parts.map((p) => ({
    label: p.label,
    key: p.key,
    master: 0,
    exact: 0,
  }));
  const byKey = new Map(parts.map((p) => [p.key, p]));

  for (const r of rows) {
    if (!r.master) continue; // only master instances define the denominator
    const partKey = partKeyForStat(group, r.master.stat.toLowerCase());
    if (!partKey) continue;
    const part = byKey.get(partKey);
    if (!part) continue;
    part.master += 1;
    if (r.status === "exact") part.exact += 1;
  }

  const master = parts.reduce((s, p) => s + p.master, 0);
  const exact = parts.reduce((s, p) => s + p.exact, 0);
  const pct = master === 0 ? 1 : exact / master;
  return {
    master,
    exact,
    pct,
    parts: parts.map(({ label, master, exact }) => ({ label, master, exact })),
  };
}

/**
 * Compute the football Player Accuracy groups (EXACT-match / event-level) from
 * scoped comparison rows. Each group's % is exact / master — the same measure
 * as the per-stat breakdown table, grouped into Passing / Offensive /
 * Defensive / Goalkeeper (+ Overall across all of them).
 *
 * Pass the already-scoped ComparisonRow[] (the caller applies any time-range /
 * team filtering before comparing).
 */
export function computePlayerAccuracy(
  rows: ComparisonRow[]
): PlayerAccuracy {
  const passing = buildGroup(FOOTBALL_GROUPS.passing, rows);
  const offensive = buildGroup(FOOTBALL_GROUPS.offensive, rows);
  const defensive = buildGroup(FOOTBALL_GROUPS.defensive, rows);
  const goalkeeper = buildGroup(FOOTBALL_GROUPS.goalkeeper, rows);

  // Overall spans every part from every group.
  const overall = buildGroup(
    {
      label: "Overall",
      parts: [
        ...FOOTBALL_GROUPS.passing.parts,
        ...FOOTBALL_GROUPS.offensive.parts,
        ...FOOTBALL_GROUPS.defensive.parts,
        ...FOOTBALL_GROUPS.goalkeeper.parts,
      ],
    },
    rows
  );

  return { overall, passing, offensive, defensive, goalkeeper };
}
