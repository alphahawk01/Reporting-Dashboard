import { AnalystMetrics } from "./buildAnalystMetrics";

export function buildAnalystBenchmark(
  analysts: AnalystMetrics[]
) {
  // -------------------------
  // SORT BY OVERALL RATING
  // -------------------------
const ausAnalysts = analysts
  .filter(a => a.team === "AUS")
  .sort((a, b) => b.ratings.overall - a.ratings.overall);

const phlAnalysts = analysts
  .filter(a => a.team === "PHL")
  .sort((a, b) => b.ratings.overall - a.ratings.overall);

function applyRanking(list: typeof analysts) {
  list.forEach((a, index) => {
    a.rank = index + 1;

    a.totalAnalysts = list.length;

    a.percentile = Math.round(
      ((index + 1) / list.length) * 100
    );
  });
}

applyRanking(ausAnalysts);
applyRanking(phlAnalysts);

return analysts;
  // -------------------------
  // ASSIGN RANK & PERCENTILE
  // -------------------------
analysts.forEach((a, index) => {
  a.rank = index + 1;

  // Best analyst = Top 1%
  a.percentile = Math.max(
    1,
    Math.round(
      ((index + 1) / analysts.length) * 100
    )
  );

  a.totalAnalysts = analysts.length;
});
  return analysts;
}