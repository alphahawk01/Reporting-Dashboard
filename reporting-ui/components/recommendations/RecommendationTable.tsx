"use client";

import { Fragment, useMemo, useState } from "react";

import type { Recommendation } from "@/lib/recommendations/recommendationEngine";
import type { TTGame } from "@/types/ttgame";
import type { DownloadJob } from "@/lib/api/downloadJobs";
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
  downloadJob?: DownloadJob | null;

  onAssign: (
    recommendation: Recommendation
  ) => void;

  onAssignOther: () => void;
}

export default function RecommendationTable({
  fixture,
  recommendations,
  downloadJob,
  onAssign,
  onAssignOther,
}: Props) {

  const [expanded, setExpanded] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<string[]>([]);

  const toggleDay = (day: string) => {
    setDayFilter(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const filteredRecommendations = useMemo(() => {
    if (dayFilter.length === 0) return recommendations;

    return recommendations.filter(r =>
      dayFilter.every(day => r.availabilityDays.includes(day))
    );
  }, [recommendations, dayFilter]);

  if (recommendations.length === 0) {
    return (
      <div className="text-slate-500">
        No recommendations available.
      </div>
    );
  }

  return (
    <div className="mt-4 w-full overflow-hidden rounded-xl border border-slate-700">

      {/* DAY FILTER */}
      <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-900/50 px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 shrink-0">
          Filter by day:
        </span>
        <div className="flex gap-1">
          {weekDays.map(day => {
            const active = dayFilter.includes(day.full);
            return (
              <button
                key={day.full}
                onClick={() => toggleDay(day.full)}
                className={`flex h-7 w-7 items-center justify-center rounded text-[10px] font-bold transition ${
                  active
                    ? "bg-sky-500 text-white border border-sky-400"
                    : "bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500"
                }`}
                title={day.full}
              >
                {day.short}
              </button>
            );
          })}
        </div>
        {dayFilter.length > 0 && (
          <button
            onClick={() => setDayFilter([])}
            className="ml-2 text-[10px] text-slate-500 hover:text-white"
          >
            Clear
          </button>
        )}
        {dayFilter.length > 0 && (
          <span className="ml-auto text-[10px] text-slate-500">
            {filteredRecommendations.length} of {recommendations.length} analysts
          </span>
        )}
      </div>

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

            <th className="w-[20%] px-3 py-3 text-center">
              Actions
            </th>

          </tr>
        </thead>

        <tbody>
          {filteredRecommendations.slice(0, 5).map((r, index) => {
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

                        {r.evidence.affiliatedTeams &&
                          r.evidence.affiliatedTeams.length > 0 && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">

                              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                                Affiliated
                              </span>

                              {r.evidence.affiliatedTeams.map(
                                team => (
                                  <span
                                    key={team}
                                    className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                                  >
                                    {team}
                                  </span>
                                )
                              )}

                              <span className="text-[10px] font-semibold text-amber-400">
                                +{r.evidence.affiliationScore}
                              </span>

                            </div>
                          )}

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
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${r.confidence === "Excellent"
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

                  <td className="px-3 py-3">
                    <div className="flex justify-center gap-2">

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

                      <button
                        onClick={() => onAssign(r)}
                        className="rounded-md bg-sky-600 px-3 py-1 text-sm font-semibold transition hover:bg-sky-500"
                      >
                        Assign
                      </button>

                    </div>
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
      <div className="border-t border-slate-700 px-4 py-3">

        <div className="mb-2 flex items-center justify-between">

          <div className="flex items-center gap-2">

            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Download
            </span>

            {!downloadJob && (
              <span className="text-xs text-slate-500">
                Not queued
              </span>
            )}

            {downloadJob?.status === "Queued" && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-400">
                <span className="h-2 w-2 rounded-full bg-yellow-400" />
                Queued
              </span>
            )}

            {downloadJob?.status === "Downloading" && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-sky-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
                Downloading
              </span>
            )}

            {downloadJob?.status === "Downloaded" && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                Downloaded
              </span>
            )}

            {downloadJob?.status === "Failed" && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                Failed
              </span>
            )}

          </div>

          {downloadJob?.status === "Downloading" &&
            downloadJob.downloadSpeedMbps > 0 && (
              <span className="text-xs font-medium text-slate-300">
                {downloadJob.downloadSpeedMbps.toFixed(1)} MB/s
              </span>
            )}

        </div>

        {downloadJob?.status === "Downloading" && (() => {

          const downloaded = downloadJob.downloadedBytes ?? 0;
          const total = downloadJob.fileSizeBytes ?? 0;
          const speed = downloadJob.downloadSpeedMbps ?? 0;

          const percent =
            total > 0
              ? Math.min(100, (downloaded / total) * 100)
              : 0;

          const remainingBytes =
            Math.max(0, total - downloaded);

          const etaSeconds =
            speed > 0 && total > 0
              ? remainingBytes / (speed * 1024 * 1024)
              : 0;

          const formatBytes = (bytes: number) => {
            if (bytes <= 0) return "0 MB";

            const gb =
              bytes / 1024 / 1024 / 1024;

            if (gb >= 1) {
              return `${gb.toFixed(2)} GB`;
            }

            const mb =
              bytes / 1024 / 1024;

            return `${mb.toFixed(0)} MB`;
          };

          const formatEta = (seconds: number) => {
            if (
              !seconds ||
              !Number.isFinite(seconds)
            ) {
              return "Calculating...";
            }

            const rounded = Math.ceil(seconds);

            const minutes =
              Math.floor(rounded / 60);

            const secs =
              rounded % 60;

            if (minutes > 0) {
              return `${minutes}m ${secs}s remaining`;
            }

            return `${secs}s remaining`;
          };

          return (
            <>
              <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">

                <span>
                  {formatBytes(downloaded)}
                  {" / "}
                  {total > 0
                    ? formatBytes(total)
                    : "Calculating size"}
                </span>

                <span className="font-semibold text-slate-300">
                  {percent.toFixed(1)}%
                </span>

              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">

                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-500"
                  style={{
                    width: `${percent}%`,
                  }}
                />

              </div>

              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">

                <span>
                  {formatEta(etaSeconds)}
                </span>

                {total > 0 && (
                  <span>
                    {formatBytes(remainingBytes)} remaining
                  </span>
                )}

              </div>
            </>
          );

        })()}

        {downloadJob?.status === "Downloaded" && (
          <div className="text-xs text-green-400">
            Download complete
          </div>
        )}

        {downloadJob?.status === "Failed" && (
          <div className="mt-1 text-xs text-red-400">
            {downloadJob.downloadError || "Download failed"}
          </div>
        )}

      </div>

      <div className="border-t border-slate-700 p-4">

        <button
          onClick={onAssignOther}
          className="w-full rounded-lg border border-slate-600 py-3 font-semibold transition hover:bg-slate-700"
        >
          Assign Another Analyst
        </button>

      </div>
    </div>
  );
}