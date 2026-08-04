"use client";

import { Fragment, useState } from "react";

import type {
  FixtureRecommendation,
} from "@/lib/recommendations/recommendationEngine";

import RecommendationDetails from "./RecommendationDetails";

interface Props {
  recommendation?: FixtureRecommendation;
}

export default function RecommendationTable({
  recommendation,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!recommendation) {
    return (
      <div className="text-slate-500">
        No recommendations available.
      </div>
    );
  }

  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-slate-700">

      <table className="w-full">

        <thead className="bg-slate-900">

          <tr>

            <th className="w-16 px-4 py-3 text-left">
              Rank
            </th>

<th className="w-[320px] px-4 py-3 text-left">
  Analyst
</th>

            <th className="w-28 px-4 py-3 text-center">
              Score
            </th>

            <th className="w-32 px-4 py-3 text-center">
              Confidence
            </th>

            <th className="w-24 px-4 py-3 text-center">
              Details
            </th>

          </tr>

        </thead>

        <tbody>

          {recommendation.recommendations
            .slice(0, 5)
            .map((r, index) => {

              const medal =
                index === 0
                  ? "🥇"
                  : index === 1
                    ? "🥈"
                    : index === 2
                      ? "🥉"
                      : `${index + 1}`;

              return (

                <Fragment key={r.analyst.key}>

                  <tr className="border-t border-slate-700 hover:bg-slate-800 transition">

                    <td className="px-4 3 font-semibold">
                      {medal}
                    </td>

<td className="px-4 py-3">

  <div className="flex items-center gap-3">

    <span
      className="truncate whitespace-nowrap font-semibold text-white"
      title={r.analyst.name}
    >
      {r.analyst.name}
    </span>

    <span
      className="shrink-0 rounded bg-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300"
    >
      {r.analyst.team}
    </span>

  </div>

</td>

                    <td className="px-4 py-3 text-center">

                      <span className="font-bold text-sky-400">
                        {r.score.toFixed(1)}
                      </span>

                    </td>

                    <td className="px-4 py-3 text-center">

                      <span
                        className={`
                          rounded-full
                          px-3
                          py-1
                          text-xs
                          font-semibold
                          ${r.confidence === "Excellent"
                            ? "bg-green-500/20 text-green-400"
                            : r.confidence === "High"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : r.confidence === "Medium"
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-red-500/20 text-red-400"
                          }
                        `}
                      >
                        {r.confidence}
                      </span>

                    </td>

                    <td className="px-4 py-3 text-center">

                      <button
                        onClick={() =>
                          setExpanded(
                            expanded === r.analyst.key
                              ? null
                              : r.analyst.key
                          )
                        }
                        className="
                          rounded-md
                          border
                          border-slate-600
                          px-3
                          py-1
                          text-sm
                          hover:bg-slate-700
                          transition
                        "
                      >
                        {expanded === r.analyst.key
                          ? "Hide"
                          : "Details"}
                      </button>

                    </td>

                  </tr>

                  {expanded === r.analyst.key && (

                    <tr className="bg-slate-900">

                      <td
                        colSpan={5}
                        className="p-0"
                      >

                        <RecommendationDetails
                          recommendation={r}
                          fixture={recommendation.fixture}
                        />

                      </td>

                    </tr>

                  )}

                </Fragment>

              );

            })}

        </tbody>

      </table>

    </div>
  );
}