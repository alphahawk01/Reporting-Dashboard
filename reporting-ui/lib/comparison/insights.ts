// Rule-based insight + recommendation generator built from a ComparisonResult.
// No external AI dependency — deterministic analysis of the comparison stats.

import type { ComparisonResult, ComparisonRow } from "./xml-compare";

export type Insight = {
  tone: "positive" | "warning" | "critical" | "neutral";
  title: string;
  detail: string;
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Top offenders by a key extractor over non-exact master rows. */
function topOffenders(
  rows: ComparisonRow[],
  key: (r: ComparisonRow) => string | null,
  limit = 3
): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.status === "exact" || r.status === "extra") continue;
    const k = key(r);
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function generateInsights(result: ComparisonResult): Insight[] {
  const insights: Insight[] = [];
  const { summary, rows, tolerance, byCategory } = result;

  // Overall accuracy
  const acc = summary.accuracy;
  insights.push({
    tone: acc >= 0.9 ? "positive" : acc >= 0.75 ? "warning" : "critical",
    title: `Overall accuracy ${pct(acc)}`,
    detail: `${summary.exact} of ${summary.masterTotal} master instances were logged exactly (correct team, player and stat within ${tolerance}s). ${
      acc >= 0.9
        ? "This is strong analyst agreement."
        : acc >= 0.75
          ? "Agreement is decent but there is room to tighten up."
          : "Agreement is low — review the breakdown below closely."
    }`,
  });

  // Missed events
  if (summary.missed > 0) {
    const rate = summary.missed / Math.max(1, summary.masterTotal);
    insights.push({
      tone: rate >= 0.15 ? "critical" : "warning",
      title: `${summary.missed} missed event${summary.missed === 1 ? "" : "s"} (${pct(rate)})`,
      detail: `These instances exist in the master but the analyst logged nothing within ${tolerance}s. Missed events usually point to gaps in live coding pace or attention during busy passages.`,
    });
  }

  // Extra events (false positives)
  if (summary.extra > 0) {
    insights.push({
      tone: summary.extra >= 5 ? "warning" : "neutral",
      title: `${summary.extra} extra event${summary.extra === 1 ? "" : "s"} logged`,
      detail: `The analyst logged instances with no master match within ${tolerance}s. These are potential over-calls or duplicates.`,
    });
  }

  // Wrong player
  if (summary.wrongPlayer > 0) {
    const offenders = topOffenders(
      rows.filter((r) => r.status === "wrong_player"),
      (r) =>
        r.master?.playerNumber != null
          ? `${r.master.team} #${r.master.playerNumber}`
          : null
    );
    insights.push({
      tone: "warning",
      title: `${summary.wrongPlayer} correct-team, wrong-player call${summary.wrongPlayer === 1 ? "" : "s"}`,
      detail:
        `Right team and stat, wrong jersey number. ` +
        (offenders.length
          ? `Most affected: ${offenders.map((o) => `${o.label} (${o.count})`).join(", ")}.`
          : ""),
    });
  }

  // Wrong stat
  if (summary.wrongStat > 0) {
    const offenders = topOffenders(
      rows.filter((r) => r.status === "wrong_stat"),
      (r) =>
        r.master && r.analyst
          ? `${r.master.stat} → ${r.analyst.stat}`
          : null
    );
    insights.push({
      tone: "warning",
      title: `${summary.wrongStat} correct-player, wrong-stat call${summary.wrongStat === 1 ? "" : "s"}`,
      detail:
        `Right player, but the stat/action differs. ` +
        (offenders.length
          ? `Common confusions: ${offenders.map((o) => `${o.label} (${o.count})`).join(", ")}.`
          : ""),
    });
  }

  // Wrong team
  if (summary.wrongTeam > 0) {
    insights.push({
      tone: "critical",
      title: `${summary.wrongTeam} wrong-team call${summary.wrongTeam === 1 ? "" : "s"}`,
      detail: `A matched instance was attributed to the wrong team. These are high-impact errors and worth reviewing frame-by-frame.`,
    });
  }

  // Timing drift
  if (summary.exact > 0) {
    insights.push({
      tone: summary.avgTimeDrift <= 1 ? "positive" : "neutral",
      title: `Average timing drift ${summary.avgTimeDrift.toFixed(1)}s on exact matches`,
      detail:
        summary.avgTimeDrift <= 1
          ? "Timestamps are tightly aligned with the master."
          : `Exact matches drift by ${summary.avgTimeDrift.toFixed(1)}s on average. Still within the ${tolerance}s tolerance, but worth noting if you tighten the window.`,
    });
  }

  // Weakest category
  const weakest = [...byCategory]
    .filter((c) => c.total >= 2)
    .sort((a, b) => a.accuracy - b.accuracy)[0];
  if (weakest && weakest.accuracy < 0.85) {
    insights.push({
      tone: "warning",
      title: `Weakest stat category: ${weakest.category} (${pct(weakest.accuracy)})`,
      detail: `Only ${weakest.exact} of ${weakest.total} ${weakest.category} instances matched exactly. Focused review or re-training on this category would lift overall accuracy most.`,
    });
  }

  return insights;
}

export function generateRecommendations(result: ComparisonResult): string[] {
  const recs: string[] = [];
  const { summary, byCategory, tolerance } = result;

  if (summary.missed / Math.max(1, summary.masterTotal) >= 0.1)
    recs.push(
      "Reduce missed events: consider a second pass on busy passages or splitting live coding across analysts."
    );
  if (summary.extra >= 3)
    recs.push(
      "Trim over-calls: review the extra instances for duplicates or actions that don't meet the stat definition."
    );
  if (summary.wrongStat >= 3)
    recs.push(
      "Clarify stat definitions where actions are being confused (e.g. successful vs unsuccessful, blocks vs clearances)."
    );
  if (summary.wrongPlayer >= 3)
    recs.push(
      "Improve player identification — check jersey visibility and roster mapping for the most-affected players."
    );
  if (summary.wrongTeam > 0)
    recs.push(
      "Audit wrong-team calls immediately; these distort both teams' totals."
    );

  const weakest = [...byCategory]
    .filter((c) => c.total >= 2)
    .sort((a, b) => a.accuracy - b.accuracy)[0];
  if (weakest && weakest.accuracy < 0.85)
    recs.push(
      `Prioritise re-training on "${weakest.category}" — it is the lowest-accuracy category.`
    );

  if (summary.avgTimeDrift > tolerance * 0.6)
    recs.push(
      "Timing drift is close to the tolerance limit; encourage tagging closer to the moment of action."
    );

  if (recs.length === 0)
    recs.push(
      "Accuracy is strong across the board — maintain current process and spot-check periodically."
    );

  return recs;
}
