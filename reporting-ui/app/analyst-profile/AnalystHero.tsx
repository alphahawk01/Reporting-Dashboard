"use client";

import Card from "@/components/UI/Card";
import { THEME } from "@/lib/theme";
import { useEffect, useState } from "react";
import {
  getAnalystImage,
  getAnalystInitials,
} from "./analystImages";
import AttributeBar from "./AttributeBar";

type Props = {
  data: any;
};

export default function AnalystHero({ data }: Props) {
  const image = getAnalystImage(data.name);
  const initials = getAnalystInitials(data.name);

  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [image]);

  return (
    <Card>
      <div
        className="relative overflow-visible rounded-3xl p-6"
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

        <div className="relative flex items-start justify-between gap-8">

          {/* ================= LEFT ================= */}

          <div className="flex items-center gap-6">

            <div
              className="h-28 w-28 overflow-hidden rounded-full border-4 shadow-xl flex-shrink-0"
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
                  className="flex h-full w-full items-center justify-center text-4xl font-bold"
                  style={{
                    background: THEME.panel,
                    color: THEME.accent,
                  }}
                >
                  {initials}
                </div>
              )}
            </div>

            <div>

              <h1 className="text-4xl font-bold text-white">
                {data.name}
              </h1>

              <div className="mt-3 text-slate-300">
                Rank #{data.rank} of {data.totalAnalysts}
              </div>

              <div className="text-slate-500">
                Top {data.percentile}%

              </div>

            </div>

          </div>

          {/* ================= RIGHT ================= */}

          <div className="flex items-start gap-8">

            {/* KPI CARDS */}

            <div className="grid grid-cols-2 gap-4">

              <StatCard
                title="Hours"
                value={data.totalHours.toFixed(1)}
              />

              <StatCard
                title="Games"
                value={data.totalGames.toFixed(1)}
              />

              <StatCard
                title="Cost"
                value={`$${Math.round(data.totalCost).toLocaleString()}`}
              />

              <StatCard
                title="Hrs / Game"
                value={data.avgHoursPerGame.toFixed(2)}
              />

            </div>

 {/* OVERALL CARD */}

<div className="relative w-44 rounded-3xl border border-sky-500/30 bg-sky-500/10 p-6 text-center">

  <div className="flex items-center justify-center gap-2">
    <div className="text-xs uppercase tracking-[0.35em] text-sky-400">
      Overall
    </div>

    <div className="group relative">
      <span className="cursor-help text-slate-400 transition-colors hover:text-sky-400">
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
          Your Overall Rating is calculated using a weighted combination of all performance attributes.
        </p>

        <div className="border-t border-slate-700 pt-3">
          <h5 className="mb-3 font-semibold text-white">
            Overall Rating Guide
          </h5>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="rounded bg-emerald-600 px-2 py-0.5 font-bold text-white">95+</span>
              <span className="text-slate-300">G.O.A.T</span>
            </div>

            <div className="flex justify-between">
              <span className="rounded bg-green-600 px-2 py-0.5 font-bold text-white">90+</span>
              <span className="text-slate-300">Champion</span>
            </div>

            <div className="flex justify-between">
              <span className="rounded bg-sky-600 px-2 py-0.5 font-bold text-white">85+</span>
              <span className="text-slate-300">Elite</span>
            </div>

            <div className="flex justify-between">
              <span className="rounded bg-amber-500 px-2 py-0.5 font-bold text-black">80+</span>
              <span className="text-slate-300">Strong</span>
            </div>

            <div className="flex justify-between">
              <span className="rounded bg-orange-500 px-2 py-0.5 font-bold text-white">75+</span>
              <span className="text-slate-300">Reliable</span>
            </div>

            <div className="flex justify-between">
              <span className="rounded bg-orange-700 px-2 py-0.5 font-bold text-white">60+</span>
              <span className="text-slate-300">Developing</span>
            </div>

            <div className="flex justify-between">
              <span className="rounded bg-rose-600 px-2 py-0.5 font-bold text-white">&lt;60</span>
              <span className="text-slate-300">Rookie</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div className="mt-3 text-7xl font-black leading-none text-white">
    {data.ratings?.overall ?? "--"}
  </div>

  <div className="mt-4 text-lg font-semibold text-amber-400">
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
    <div className="min-w-[145px] rounded-2xl border border-slate-700 bg-black/20 px-6 py-4 text-center">

      <div className="text-3xl font-bold text-white">
        {value}
      </div>

      <div className="mt-2 text-xs uppercase tracking-wider text-slate-400">
        {title}
      </div>

    </div>
  );
}