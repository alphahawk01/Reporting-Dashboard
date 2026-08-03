import type { AnalystMetrics } from "@/types/analyst";

export interface RecommendationProfile {
    analyst: AnalystMetrics;

    leagues: Record<
        string,
        {
            games: number;
            lastGame?: Date;
        }
    >;

    teams: Record<
        string,
        {
            games: number;
            lastGame?: Date;
        }
    >;

    recentGames30: number;
    recentGames90: number;

    currentWeekGames: number;
}

export interface RecommendationResult {

    analyst: AnalystMetrics;

    score: number;

    breakdown: {

        leagueExperience: number;

        homeTeamExperience: number;

        awayTeamExperience: number;

        workload: number;

        quality: number;

        speed: number;

    };

    reasons: string[];
}