import { AnalystMetrics } from "./buildAnalystMetrics";

export type RatedAnalyst = AnalystMetrics & {
  ratings: {
    games: string;
    hours: string;
    cost: string;
  };
};

function band(p: number) {
  if (p <= 0.1) return "Elite";
  if (p <= 0.35) return "Above Average";
  if (p <= 0.65) return "Average";
  return "Below Average";
}

export function rankAnalystMetrics(data: AnalystMetrics[]): RatedAnalyst[] {
  const safe = data ?? [];

  const sortedGames = [...safe].sort((a, b) => b.totalGames - a.totalGames);
  const sortedHours = [...safe].sort((a, b) => a.avgHoursPerGame - b.avgHoursPerGame);
  const sortedCost = [...safe].sort((a, b) => a.avgCostPerGame - b.avgCostPerGame);

  const pct = (arr: AnalystMetrics[], key: string) => {
    const idx = arr.findIndex(x => x.key === key);
    return idx === -1 ? 1 : idx / Math.max(arr.length - 1, 1);
  };

  return safe.map((a) => {
    const gameP = pct(sortedGames, a.key);
    const hourP = pct(sortedHours, a.key);
    const costP = pct(sortedCost, a.key);

    return {
      ...a,
      ratings: {
        games: band(gameP),
        hours: band(hourP),
        cost: band(costP),
      },
    };
  });
}