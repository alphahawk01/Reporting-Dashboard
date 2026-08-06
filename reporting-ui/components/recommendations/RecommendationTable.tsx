"use client";

import { Fragment, useState } from "react";

import type { Recommendation } from "@/lib/recommendations/recommendationEngine";
import type { TTGame } from "@/types/ttgame";

import RecommendationDetails from "./RecommendationDetails";

const weekDays = [
  { short: "Sa", full: "Saturday" },
  { short: "Su", full: "Sunday" },
  { short: "Mo", full: "Monday" },
  { short: "Tu", full: "Tuesday" },
  { short: "We", full: "Wednesday" },
  { short: "Th", full: "Thursday" },
  { short: "Fr", full: "Friday" },
];

interface Props {
  fixture: TTGame;
  recommendations: Recommendation[];
}

export default function RecommendationTable({
  fixture,
  recommendations,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (recommendations.length === 0) {
    return (
      <div className="text-slate-500">
        No recommendations available.
      </div>
    );
  }

  return (
    <div className="mt-8 w-full overflow-hidden rounded-xl border border-slate-700">
      <table className="table-fixed w-full">
        <thead className="bg-slate-900">
          <tr>
            <th className="w-[8%] px-3 py-3 text-left">
              Rank
            </th>

            <th className="w-[30%] px-3 py-3 text-left">
              Analyst
            </th>

            <th className="w-[10%] px-3 py-3 text-center">
              Score
            </th>

            <th className="w-[16%] px-3 py-3 text-center">
              Confidence
            </th>

            <th className="w-[24%] px-3 py-3 text-center">
              Availability
            </th>

            <th className="w-[12%] px-3 py-3 text-center">
              Details
            </th>
          </tr>
        </thead>

        <tbody>
          {recommendations.slice(0, 5).map((r, index) => {
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
                <tr className="border-t border-slate-700 transition hover:bg-slate-800">
                  <td className="px-3 py-3 font-semibold">
                    {medal}
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate font-semibold text-white"
                          title={r.analyst.name}
                        >
                          {r.analyst.name}
                        </div>
                      </div>

                      <span className="shrink-0 rounded bg-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                        {r.analyst.team}
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-3 text-center">
                    <span className="font-bold text-sky-400">
                      {r.score.toFixed(1)}
                    </span>
                  </td>

                  <td className="px-3 py-3 text-center">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        r.confidence === "Excellent"
                          ? "bg-green-500/20 text-green-400"
                          : r.confidence === "High"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : r.confidence === "Medium"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {r.confidence}
                    </span>
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex justify-center gap-1">

                      {weekDays.map((day) => {

                        const works =
                          r.availabilityDays.includes(day.full);

                        const expected =
                          fixture.expected_day === day.full;

                        let classes =
                          "flex h-8 w-8 items-center justify-center rounded-md border text-[11px] font-bold transition";

                        if (expected && works) {
                          classes +=
                            " border-green-400 bg-green-500/30 text-green-200";
                        }
                        else if (expected && !works) {
                          classes +=
                            " border-red-400 bg-red-500/30 text-red-200";
                        }
                        else if (works) {
                          classes +=
                            " border-sky-400 bg-sky-500/20 text-sky-200";
                        }
                        else {
                          classes +=
                            " border-slate-700 bg-slate-800 text-slate-500";
                        }

                        return (
                          <div
                            key={day.full}
                            className={classes}
                            title={day.full}
                          >
                            {day.short}
                          </div>
                        );

                      })}

                    </div>
                  </td>

                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() =>
                        setExpanded(
                          expanded === r.analyst.key
                            ? null
                            : r.analyst.key
                        )
                      }
                      className="rounded-md border border-slate-600 px-3 py-1 text-sm transition hover:bg-slate-700"
                    >
                      {expanded === r.analyst.key
                        ? "Hide"
                        : "Details"}
                    </button>
                  </td>
                </tr>

                {expanded === r.analyst.key && (
                  <tr className="bg-slate-900">
                    <td colSpan={6} className="p-0">
                      <RecommendationDetails
                        recommendation={r}
                        fixture={fixture}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <div className="flex flex-wrap justify-center gap-6 border-t border-slate-700 bg-slate-900 px-4 py-3 text-xs text-slate-400">

        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-green-500"></span>
          Match day & working
        </div>

        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-sky-500"></span>
          Working
        </div>

        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-red-500"></span>
          Match day off
        </div>

        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-slate-700"></span>
          Off
        </div>

      </div>
    </div>
  );
}