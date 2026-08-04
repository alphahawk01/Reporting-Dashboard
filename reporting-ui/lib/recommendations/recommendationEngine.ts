import type { AnalystMetrics } from "@/types/analyst";
import type { TTGame } from "@/types/ttgame";

import {
    scoreLeagueExperience,
    scoreHomeTeamExperience,
    scoreAwayTeamExperience,
    scoreQuality,
    scoreSpeed,
    scoreRecentExperience,
    normaliseScore,
} from "./scoring";

import { RecommendationWeights } from "./weights";
import type { RecommendationContext } from "./types";

// ------------------------------------------------
// EVIDENCE
// ------------------------------------------------

export interface EvidenceItem {

    label: string;

    value: number | string;

    assessment: string;

}

export interface RecommendationEvidence {

    leagueGames: number;

    homeTeamGames: number;

    awayTeamGames: number;
    leagueExperience: number;

    recentGames: number;

    overallRating: number;

    totalGames: number;

    averageHoursPerGame?: number;

    homeTeamName?: string;

    awayTeamName?: string;

}

// ------------------------------------------------
// RECOMMENDATION
// ------------------------------------------------

export interface Recommendation {

    analyst: AnalystMetrics;

    score: number;

    confidence:
    | "Excellent"
    | "High"
    | "Medium"
    | "Low";

    summary: string;

    evidence: RecommendationEvidence;

}

export interface FixtureRecommendation {
    fixture: TTGame;
    recommendations: Recommendation[];
}

export function buildRecommendations(
    fixture: TTGame,
    analysts: AnalystMetrics[],
    historicalGames: TTGame[]
): Recommendation[] {

        const recommendations = analysts
            .map((analyst) => {
                const context: RecommendationContext = {
                    fixture,
                    analyst,
                    analysts,
                    historicalGames,
                };

                const leagueGames = scoreLeagueExperience(context);

                const homeGames = scoreHomeTeamExperience(context);

                const awayGames = scoreAwayTeamExperience(context);

                const recentGames = scoreRecentExperience(context);

                const qualityRating = scoreQuality(context);

                const speedRating = scoreSpeed(context);

                const maxLeague = Math.max(
                    ...analysts.map((a) =>
                        scoreLeagueExperience({
                            fixture,
                            analyst: a,
                            analysts,
                            historicalGames,
                        })
                    ),
                    1
                );

                const league = normaliseScore(
                    leagueGames,
                    maxLeague,
                    RecommendationWeights.leagueExperience
                );

                const maxHome = Math.max(
                    ...analysts.map(a =>
                        scoreHomeTeamExperience({
                            fixture,
                            analyst: a,
                            analysts,
                            historicalGames,
                        })
                    ),
                    1
                );

                const maxAway = Math.max(
                    ...analysts.map(a =>
                        scoreAwayTeamExperience({
                            fixture,
                            analyst: a,
                            analysts,
                            historicalGames
                        })
                    ),
                    1
                );

                const maxRecent = Math.max(
                    ...analysts.map(a =>
                        scoreRecentExperience({
                            fixture,
                            analyst: a,
                            analysts,
                            historicalGames
                        })
                    ),
                    1
                );

                const maxQuality = Math.max(
                    ...analysts.map(a =>
                        scoreQuality({
                            fixture,
                            analyst: a,
                            analysts,
                            historicalGames
                        })
                    ),
                    1
                );

                const maxSpeed = Math.max(
                    ...analysts.map(a =>
                        scoreSpeed({
                            fixture,
                            analyst: a,
                            analysts,
                            historicalGames
                        })
                    ),
                    1
                );


                const home = normaliseScore(
                    homeGames,
                    maxHome,
                    RecommendationWeights.homeTeamExperience
                );

                const away = normaliseScore(
                    awayGames,
                    maxAway,
                    RecommendationWeights.awayTeamExperience
                );

                const recent = normaliseScore(
                    recentGames,
                    maxRecent,
                    RecommendationWeights.recentExperience
                );

                const quality = normaliseScore(
                    qualityRating,
                    maxQuality,
                    RecommendationWeights.quality
                );

                const speed = normaliseScore(
                    speedRating,
                    maxSpeed,
                    RecommendationWeights.speed
                );

                // ----------------------------
                // FINAL SCORE
                // ----------------------------

                const score =
                    league +
                    home +
                    away +
                    recent +
                    quality +
                    speed;

                // ----------------------------
                // CONFIDENCE
                // ----------------------------

                let confidence:
                    | "Excellent"
                    | "High"
                    | "Medium"
                    | "Low";

                if (score >= 90)
                    confidence = "Excellent";
                else if (score >= 75)
                    confidence = "High";
                else if (score >= 60)
                    confidence = "Medium";
                else
                    confidence = "Low";

                // ----------------------------
                // SUMMARY
                // ----------------------------

                let summary: string;

                if (leagueGames >= 10) {
                    summary = "Highly experienced in this league.";
                }
                else if ((homeGames + awayGames) >= 10) {
                    summary = "Extensive experience with these teams.";
                }
                else if (analyst.ratings.overall >= 85) {
                    summary = "High-performing analyst with strong quality rating.";
                }
                else {
                    summary = "Suitable recommendation based on available experience.";
                }

                // ----------------------------
                // EVIDENCE
                // ----------------------------

                const evidence: RecommendationEvidence = {
                    leagueGames,
                    homeTeamGames: homeGames,
                    awayTeamGames: awayGames,
                    recentGames,
                    overallRating: analyst.ratings.overall,
                    totalGames: analyst.totalGames,
                    leagueExperience: leagueGames,
                    homeTeamName: fixture.home_team ?? "",
                    awayTeamName: fixture.away_team ?? "",
                };

                return {

                    analyst,

                    score,

                    confidence,

                    summary,

                    evidence,

                };

            })
            .sort((a, b) => b.score - a.score);

return recommendations.sort(
    (a, b) => b.score - a.score
);
}