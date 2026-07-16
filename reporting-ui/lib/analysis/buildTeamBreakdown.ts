// lib/analysis/buildTeamBreakdown.ts

export function buildTeamBreakdown(matches: any[], analystId: string) {
  const map: Record<string, number> = {};

  for (const match of matches) {
    const isHome = match.homeAnalystId === analystId;
    const isAway = match.awayAnalystId === analystId;

    if (!isHome && !isAway) continue;

    const team = isHome ? match.homeTeam : match.awayTeam;
    if (!team) continue;

    map[team] = (map[team] || 0) + 1;
  }

  return map;
}