import type { Recommendation } from "@/lib/recommendations/recommendationEngine";
import type { TTGame } from "@/types/ttgame";

interface Props {
    recommendation: Recommendation;
    fixture: TTGame;
}

export default function RecommendationDetails({
    recommendation,
    fixture,
}: Props) {

    const affiliatedTeams =
        recommendation.evidence.affiliatedTeams ?? [];

    const affiliationScore =
        recommendation.evidence.affiliationScore ?? 0;

    const hasAffiliation =
        affiliatedTeams.length > 0 &&
        affiliationScore > 0;

    return (

        <div className="bg-slate-900 p-5">

            <h3 className="mb-1 text-lg font-semibold text-white">
                Recommendation Evidence
            </h3>

            <p className="mb-4 text-sm text-slate-400">
                {recommendation.summary}
            </p>

            <table className="w-full text-sm">

                <thead>

                    <tr className="border-b border-slate-700">

                        <th className="py-2 text-left">
                            Metric
                        </th>

                        <th className="py-2 text-right">
                            Value
                        </th>

                    </tr>

                </thead>

                <tbody>

                    {/* AFFILIATION */}

                    {hasAffiliation && (
                        <tr className="border-b border-slate-800">

                            <td className="py-3">

                                <div className="flex items-center gap-2">

                                    <span>
                                        Team Affiliation
                                    </span>

                                    <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                                        Bonus
                                    </span>

                                </div>

                            </td>

                            <td className="py-3 text-right">

                                <div className="flex flex-col items-end">

                                    <span className="font-medium text-amber-300">
                                        {affiliatedTeams.join(" · ")}
                                    </span>

                                    <span className="text-xs font-semibold text-amber-400">
                                        +{affiliationScore} points
                                    </span>

                                </div>

                            </td>

                        </tr>
                    )}

                    {/* HOME TEAM EXPERIENCE */}

                    <tr className="border-b border-slate-800">

                        <td className="py-3">
                            Times coded {fixture.home_team}
                        </td>

                        <td className="py-3 text-right">
                            {recommendation.evidence.homeTeamGames}
                        </td>

                    </tr>

                    {/* AWAY TEAM EXPERIENCE */}

                    <tr className="border-b border-slate-800">

                        <td className="py-3">
                            Times coded {fixture.away_team}
                        </td>

                        <td className="py-3 text-right">
                            {recommendation.evidence.awayTeamGames}
                        </td>

                    </tr>

                    {/* LEAGUE EXPERIENCE */}

                    <tr className="border-b border-slate-800">

                        <td className="py-3">
                            Times coded {fixture.Competition}
                        </td>

                        <td className="py-3 text-right">
                            {recommendation.evidence.leagueGames}
                        </td>

                    </tr>

                    {/* RECENT EXPERIENCE */}

                    <tr className="border-b border-slate-800">

                        <td className="py-3">
                            {fixture.Competition} matches coded in the last 5 weeks
                        </td>

                        <td className="py-3 text-right">
                            {recommendation.evidence.recentGames}
                        </td>

                    </tr>

                    {/* OVERALL RATING */}

                    <tr className="border-b border-slate-800">

                        <td className="py-3">
                            Overall Rating
                        </td>

                        <td className="py-3 text-right">
                            {recommendation.evidence.overallRating}
                        </td>

                    </tr>

                    {/* AVAILABILITY */}

                    <tr className="border-b border-slate-800">

                        <td className="py-3">
                            Availability (Week {fixture.Week})
                        </td>

                        <td className="py-3 text-right">
                            {recommendation.availabilityDays.length > 0
                                ? recommendation.availabilityDays.join(", ")
                                : "No shifts"}
                        </td>

                    </tr>

                    {/* TOTAL GAMES */}

                    <tr className="border-b border-slate-800">

                        <td className="py-3">
                            Total Games Coded
                        </td>

                        <td className="py-3 text-right">
                            {recommendation.evidence.totalGames}
                        </td>

                    </tr>

                </tbody>

            </table>

        </div>

    );
}