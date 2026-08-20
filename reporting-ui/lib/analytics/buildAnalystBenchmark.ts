import type { AnalystMetrics } from "@/types/analyst";

export function buildAnalystBenchmark(
  analysts: AnalystMetrics[]
): AnalystMetrics[] {
  // -------------------------
  // APPLY RANKINGS TO A TEAM
  // -------------------------
  function applyRanking(team: "AUS" | "PHL") {
    const group = analysts
      .filter((a) => a.team === team)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);

    const total = group.length;

    group.forEach((analyst, index) => {
      analyst.rank = index + 1;
      analyst.totalAnalysts = total;

      // "Top X%" — rank 1 of 102 is top 1%, last place is top 100%.
      // Clamped to a minimum of 1 so the best analyst never reads "Top 0%"
      // in large groups.
      analyst.percentile = Math.max(
        1,
        Math.round(((index + 1) / total) * 100)
      );
    });
  }

  applyRanking("AUS");
  applyRanking("PHL");

  return analysts;
}