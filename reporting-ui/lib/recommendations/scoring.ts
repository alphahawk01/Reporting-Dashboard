import type { AnalystMetrics } from "@/types/analyst";
import type { TTGame } from "@/types/ttgame";

export function scoreLeagueExperience(
    analyst: AnalystMetrics,
    fixture: TTGame
): number {

    const league =
        fixture.Competition ??
        fixture.competition ??
        "";

    return analyst.competitions[league] ?? 0;

}

export function scoreTeamExperience(
    analyst: AnalystMetrics,
    fixture: TTGame
): number {

    const home =
        analyst.teams[
            fixture.home_team ?? ""
        ]?.count ?? 0;

    const away =
        analyst.teams[
            fixture.away_team ?? ""
        ]?.count ?? 0;

    return home + away;

}