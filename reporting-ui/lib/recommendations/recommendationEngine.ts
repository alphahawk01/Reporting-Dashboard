import type { AnalystMetrics } from "@/types/analyst";
import type { TTGame } from "@/types/ttgame";

import {
    scoreLeagueExperience,
    scoreHomeTeamExperience,
    scoreAwayTeamExperience,
    scoreQuality,
    scoreRecentExperience,
} from "./scoring";

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

    recentGames: number;

    overallRating: number;

    totalGames: number;

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

    availability: string;

    availabilityDays: string[];
    availabilityMatchesFixture: boolean;

}

export function buildRecommendations(
    fixture: TTGame,
    analysts: AnalystMetrics[],
    historicalGames: TTGame[],
    analystAvailability: Map<string, string[]>
): Recommendation[] {

    return analysts

        .map((analyst) => {

            const context: RecommendationContext = {
                fixture,
                analyst,
                analysts,
                historicalGames,
            };

            const availabilityDays =
                analystAvailability.get(analyst.key) ?? [];

            const expectedDay =
                fixture.expected_day ?? "";

            const availabilityMatchesFixture =
                availabilityDays.includes(expectedDay);

            const availability =
                availabilityDays.length > 0
                    ? availabilityDays.join(", ")
                    : "No upcoming shifts";

            // ----------------------------
            // KPI SCORES
            // ----------------------------

            const league =
                scoreLeagueExperience(context);

            const home =
                scoreHomeTeamExperience(context);

            const away =
                scoreAwayTeamExperience(context);

            const recent =
                scoreRecentExperience(context);

            const quality =
                scoreQuality(context);

            // ----------------------------
            // FINAL SCORE
            // ----------------------------

            const score =
                league +
                home +
                away +
                recent +
                quality;
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

            let summary = "Suitable recommendation based on available experience.";

            if (home >= 20 || away >= 20) {
                summary = "Extensive experience with one or both teams.";
            }
            else if (league >= 16) {
                summary = "Highly experienced in this competition.";
            }
            else if (recent >= 9) {
                summary = "Strong recent experience in this league.";
            }
            else if (quality >= 2) {
                summary = "High-performing analyst.";
            }

            // ----------------------------
            // EVIDENCE
            // ----------------------------

            const evidence: RecommendationEvidence = {

                leagueGames:
                    context.analyst.competitions[
                    fixture.Competition ?? ""
                    ] ?? 0,

                homeTeamGames:
                    context.analyst.teams[
                        fixture.home_team ?? ""
                    ]?.count ?? 0,

                awayTeamGames:
                    context.analyst.teams[
                        fixture.away_team ?? ""
                    ]?.count ?? 0,

                recentGames:
                    historicalGames.filter(game => {

                        const gameWeek =
                            Number(game.Week);

                        return (
                            game.Competition === fixture.Competition &&
                            gameWeek >= Number(fixture.Week) - 5 &&
                            gameWeek < Number(fixture.Week) &&
                            (
                                game.home_allocated === analyst.name ||
                                game.away_allocated === analyst.name
                            )
                        );

                    }).length,

                overallRating:
                    analyst.ratings.overall,

                totalGames:
                    analyst.totalGames,

                homeTeamName:
                    fixture.home_team ?? "",

                awayTeamName:
                    fixture.away_team ?? "",

            };

            return {
                analyst,
                score,
                confidence,
                summary,
                evidence,
                availability,
                availabilityDays,
                availabilityMatchesFixture,
            };

        })
        .sort((a, b) => b.score - a.score);

}