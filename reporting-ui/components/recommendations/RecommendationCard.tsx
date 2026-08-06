import Metric from "./Metric";

import type { RecommendationResult } from "@/lib/recommendations/types";

interface Props {
    result: RecommendationResult;
    rank: number;
}

export default function RecommendationCard({
    result,
    rank
}: Props) {

    return (

        <div
            className="
                rounded-xl
                border
                border-slate-700
                bg-[#0f1b2d]
                p-5
            "
        >

            <div className="flex items-start justify-between">

                <div>

                    <div className="flex items-center gap-3">

                        <div
                            className="
                                flex
                                h-10
                                w-10
                                items-center
                                justify-center
                                rounded-full
                                bg-sky-600
                                font-bold
                                text-white
                            "
                        >
                            #{rank}
                        </div>

                        <div>

                            <h2 className="text-xl font-bold text-white">
                                {result.analyst.name}
                            </h2>

                            <p className="text-slate-400">
                                {result.analyst.team}
                            </p>

                        </div>

                    </div>

                </div>

                <div className="text-right">

                    <div className="text-4xl font-bold text-sky-400">
                        {result.totalScore.toFixed(1)}
                    </div>

                    <div className="text-sm text-slate-400">
                        Recommendation Score
                    </div>

                </div>

            </div>

            <div className="grid grid-cols-3 gap-3 mt-6">

                <Metric
                    label="League"
                    value={result.scores.leagueExperience}
                />

                <Metric
                    label="Home Team"
                    value={result.scores.homeTeamExperience}
                />

                <Metric
                    label="Away Team"
                    value={result.scores.awayTeamExperience}
                />

                <Metric
                    label="Recent"
                    value={result.scores.recentExperience}
                />

                <Metric
                    label="Quality"
                    value={result.scores.quality}
                />

            </div>

        </div>

    );

}