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

                    <tr className="border-b border-slate-800">

                        <td className="py-3">
                            Times coded {fixture.home_team}
                        </td>

                        <td className="py-3 text-right">
                            {recommendation.evidence.homeTeamGames}
                        </td>

                    </tr>

                    <tr className="border-b border-slate-800">

                        <td className="py-3">
                            Times coded {fixture.away_team}
                        </td>

                        <td className="py-3 text-right">
                            {recommendation.evidence.awayTeamGames}
                        </td>

                    </tr>

                    <tr className="border-b border-slate-800">

                        <td className="py-3">
                            Times coded {fixture.Competition}
                        </td>

                        <td className="py-3 text-right">
                            {recommendation.evidence.leagueGames}
                        </td>

                    </tr>

                    <tr className="border-b border-slate-800">

                        <td className="py-3">
                            {fixture.Competition} matches coded in the last 5 weeks
                        </td>

                        <td className="py-3 text-right">
                            {recommendation.evidence.recentGames}
                        </td>

                    </tr>

                    <tr className="border-b border-slate-800">

                        <td className="py-3">
                            Overall Rating
                        </td>

                        <td className="py-3 text-right">
                            {recommendation.evidence.overallRating}
                        </td>

                    </tr>

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