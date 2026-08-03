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

      // Higher score = better percentile
      analyst.percentile =
        total <= 1
          ? 100
          : Math.round(((total - index) / total) * 100);
    });
  }

  applyRanking("AUS");
  applyRanking("PHL");

  return analysts;
}