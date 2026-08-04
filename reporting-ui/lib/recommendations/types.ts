import type { AnalystMetrics } from "@/types/analyst";
import type { TTGame } from "@/types/ttgame";

export interface RecommendationContext {
    fixture: TTGame;

    analyst: AnalystMetrics;

    historicalGames: TTGame[];

    analysts: AnalystMetrics[];
}

export interface RecommendationScores {

    leagueExperience: number;

    homeTeamExperience: number;

    awayTeamExperience: number;

    recentExperience: number;

    quality: number;

    speed: number;

    workload: number;

}

export interface RecommendationResult {

    analyst: AnalystMetrics;

    scores: RecommendationScores;

    totalScore: number;

    reasons: string[];

}