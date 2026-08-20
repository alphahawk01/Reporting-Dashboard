"use client";

import { useEffect, useState } from "react";

import Card from "@/components/UI/Card";
import { THEME } from "@/lib/theme";
import type { AnalystMetrics } from "@/types/analyst";

import {
  getAnalystImage,
  getAnalystInitials,
} from "./analystImages";

import { clubLogos } from "./clubLogos";

type Props = {
  data: AnalystMetrics;
  affiliatedTeams?: string[];
  logoMap?: Record<string, string>;
};

/**
 * Maps an overall rating to its grade tier colours so the badge reflects
 * performance instead of always rendering amber.
 * Tiers mirror the Overall Rating Guide in the tooltip below.
 */
function gradeTheme(overall: number) {
  if (overall >= 95)
    return { text: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10", label: "text-emerald-400" };
  if (overall >= 90)
    return { text: "text-green-400", border: "border-green-500/40", bg: "bg-green-500/10", label: "text-green-400" };
  if (overall >= 85)
    return { text: "text-sky-400", border: "border-sky-500/40", bg: "bg-sky-500/10", label: "text-sky-400" };
  if (overall >= 80)
    return { text: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10", label: "text-amber-400" };
  if (overall >= 75)
    return { text: "text-orange-400", border: "border-orange-500/40", bg: "bg-orange-500/10", label: "text-orange-400" };
  if (overall >= 60)
    return { text: "text-orange-500", border: "border-orange-700/50", bg: "bg-orange-700/10", label: "text-orange-500" };
  return { text: "text-rose-400", border: "border-rose-500/40", bg: "bg-rose-500/10", label: "text-rose-400" };
}

function resolveTeamLogo(
  team: string,
  logoMap: Record<string, string>
): string | null {
  const key = team.trim().toLowerCase();
  return logoMap[key] ?? clubLogos[key] ?? null;
}

export default function AnalystHero({
  data,
  affiliatedTeams = [],
  logoMap = {},
}: Props) {
  const image = getAnalystImage(data.name);
  const initials = getAnalystInitials(data.name);

  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [image]);

  const grade = gradeTheme(data.ratings.overall);

  return (
    <Card>
      <div
        className="relative overflow-visible rounded-2xl px-5 py-4"
        style={{
          background: `linear-gradient(135deg, ${THEME.panelSoft}, ${THEME.panel})`,
        }}
      >
        {/* Background Glow */}
        <div
          className="absolute -right-32 -top-32 h-96 w-96 rounded-full blur-3xl opacity-20"
          style={{
            background: THEME.accent,
          }}
        />

        <div className="relative flex items-center justify-between gap-6">

          {/* LEFT */}

          <div className="flex min-w-0 items-center gap-4">

            <div
              className="h-20 w-20 overflow-hidden rounded-full border-2 shadow-lg flex-shrink-0"
              style={{
                borderColor: THEME.accent,
              }}
            >
              {!imageError ? (
                <img
                  src={image}
                  alt={data.name}
                  className="h-full w-full object-cover"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-2xl font-bold"
                  style={{
                    background: THEME.panel,
                    color: THEME.accent,
                  }}
                >
                  {initials}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold leading-tight text-white">
                {data.name}
              </h1>

              {/* RANK + PERCENTILE */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded border border-slate-600/70 bg-black/30 px-2 py-0.5 text-xs font-semibold text-slate-200">
                  Rank #{data.rank}
                  <span className="ml-1 font-normal text-slate-500">
                    / {data.totalAnalysts}
                  </span>
                </span>

                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${grade.bg} ${grade.text}`}>
                  Top {data.percentile}%
                </span>

                <span className="rounded border border-slate-700 bg-black/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  {data.team}
                </span>
              </div>

              {/* AFFILIATED TEAMS */}
              {affiliatedTeams.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400/70">
                    Affiliated
                  </span>

                  {affiliatedTeams.map(team => {
                    const logo = resolveTeamLogo(team, logoMap);

                    return (
                      <span
                        key={team}
                        className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 py-0.5 pl-0.5 pr-2 text-[11px] font-medium text-emerald-200"
                        title={team}
                      >
                        {logo ? (
                          <img
                            src={logo}
                            alt=""
                            className="h-4 w-4 rounded-full bg-white/10 object-contain"
                            onError={e => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-[8px] font-bold">
                            {team.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        {team}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT */}

          <div className="flex flex-shrink-0 items-stretch gap-3">

            {/* KPI CARDS */}

            <div className="grid grid-cols-3 gap-2">

              <StatCard
                title="Hours"
                value={data.totalHours.toFixed(1)}
              />

              <StatCard
                title="Games"
                value={data.totalGames.toFixed(1)}
              />

              <StatCard
                title="Hrs / Game"
                value={data.avgHoursPerGame.toFixed(2)}
              />

            </div>

            {/* OVERALL CARD */}

            <div className={`relative w-[104px] rounded-xl border px-3 py-2.5 text-center ${grade.border} ${grade.bg}`}>

              <div className="flex items-center justify-center gap-1">

                <div className={`text-[9px] font-semibold uppercase tracking-[0.15em] ${grade.text}`}>
                  Overall
                </div>

                <div className="group relative">

                  <span className="cursor-help text-[10px] text-slate-400 transition-colors hover:text-sky-400">
                    ⓘ
                  </span>

                  <div
                    className="
                      absolute
                      right-0
                      top-full
                      mt-3
                      z-[9999]
                      w-96
                      rounded-xl
                      border
                      border-slate-700
                      bg-[#0b1220]
                      p-4
                      text-left
                      shadow-2xl
                      ring-1
                      ring-slate-800
                      opacity-0
                      invisible
                      pointer-events-none
                      transition-all
                      duration-200
                      group-hover:visible
                      group-hover:opacity-100
                      group-hover:pointer-events-auto
                    "
                  >
                    <h4 className="mb-2 text-base font-semibold text-white">
                      Overall Rating
                    </h4>

                    <p className="mb-4 text-sm text-slate-300">
                      Your Overall Rating is calculated using a weighted
                      combination of all performance attributes.
                    </p>

                    <div className="border-t border-slate-700 pt-3">

                      <h5 className="mb-3 font-semibold text-white">
                        Overall Rating Guide
                      </h5>

                      <div className="space-y-2 text-sm">

                        <div className="flex justify-between">
                          <span className="rounded bg-emerald-600 px-2 py-0.5 font-bold text-white">
                            95+
                          </span>
                          <span className="text-slate-300">G.O.A.T</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="rounded bg-green-600 px-2 py-0.5 font-bold text-white">
                            90+
                          </span>
                          <span className="text-slate-300">Champion</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="rounded bg-sky-600 px-2 py-0.5 font-bold text-white">
                            85+
                          </span>
                          <span className="text-slate-300">Elite</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="rounded bg-amber-500 px-2 py-0.5 font-bold text-black">
                            80+
                          </span>
                          <span className="text-slate-300">Strong</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="rounded bg-orange-500 px-2 py-0.5 font-bold text-white">
                            75+
                          </span>
                          <span className="text-slate-300">Reliable</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="rounded bg-orange-700 px-2 py-0.5 font-bold text-white">
                            60+
                          </span>
                          <span className="text-slate-300">Developing</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="rounded bg-rose-600 px-2 py-0.5 font-bold text-white">
                            &lt;60
                          </span>
                          <span className="text-slate-300">Rookie</span>
                        </div>

                      </div>

                    </div>

                  </div>

                </div>

              </div>

              <div className="mt-0.5 text-4xl font-black leading-none tracking-tight text-white">
                {data.ratings.overall}
              </div>

              <div className={`mt-1 text-[11px] font-semibold ${grade.label}`}>
                {data.grade}
              </div>

            </div>

          </div>

        </div>

      </div>
    </Card>
  );
}

function StatCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="flex min-w-[86px] flex-col justify-center rounded-xl border border-slate-700 bg-black/20 px-3 py-2 text-center transition-colors hover:border-slate-500">

      <div className="text-xl font-bold leading-none text-white">
        {value}
      </div>

      <div className="mt-1 text-[9px] uppercase tracking-wider text-slate-400">
        {title}
      </div>

    </div>
  );
}