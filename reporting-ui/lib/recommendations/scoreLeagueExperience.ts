import { RecommendationContext } from "./types";

export function scoreLeagueExperience(
    context: RecommendationContext
): number {

    const league =
        context.fixture.Competition ??
        context.fixture.Competition ??
        "";

    return (
        context.analyst.competitions[league] ??
        0
    );

}