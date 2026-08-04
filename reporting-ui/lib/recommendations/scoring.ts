import { RecommendationContext } from "./types";

// ------------------------------------------------
// LEAGUE EXPERIENCE
// ------------------------------------------------

export function scoreLeagueExperience(
    context: RecommendationContext
): number {

    const league =
        context.fixture.Competition ?? "";

    return (
        context.analyst.competitions[league] ?? 0
    );

}

// ------------------------------------------------
// HOME TEAM EXPERIENCE
// ------------------------------------------------

export function scoreHomeTeamExperience(
    context: RecommendationContext
): number {

    const team =
        context.fixture.home_team ?? "";

    return (
        context.analyst.teams[team]?.count ??
        0
    );

}

// ------------------------------------------------
// AWAY TEAM EXPERIENCE
// ------------------------------------------------

export function scoreAwayTeamExperience(
    context: RecommendationContext
): number {

    const team =
        context.fixture.away_team ?? "";

    return (
        context.analyst.teams[team]?.count ??
        0
    );

}

// ------------------------------------------------
// QUALITY
// ------------------------------------------------

export function scoreQuality(
    context: RecommendationContext
): number {

    return context.analyst.ratings.overall;

}

// ------------------------------------------------
// SPEED
// ------------------------------------------------

export function scoreSpeed(
    context: RecommendationContext
): number {

    // Lower hours/game = better

    if (
        context.analyst.avgHoursPerGame === 0
    ) return 0;

    return (
        1 /
        context.analyst.avgHoursPerGame
    );

}

// ------------------------------------------------
// RECENT EXPERIENCE
// ------------------------------------------------

export function scoreRecentExperience(
    context: RecommendationContext
): number {

    const currentWeek = Number(context.fixture.Week);

    return context.historicalGames.filter((game) => {

        const gameWeek = Number(game.Week);

        return (
            game.Competition === context.fixture.Competition &&
            gameWeek >= currentWeek - 5 &&
            gameWeek < currentWeek &&
            (
                game.home_allocated === context.analyst.name ||
                game.away_allocated === context.analyst.name
            )
        );

    }).length;

}
// ------------------------------------------------
// NORMALISE
// ------------------------------------------------

export function normaliseScore(
    value: number,
    max: number,
    weight: number
): number {

    if (max <= 0) return 0;

    return (value / max) * weight;

}