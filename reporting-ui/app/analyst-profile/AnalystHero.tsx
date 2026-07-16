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
        className="relative overflow-hidden rounded-3xl p-6"
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

            <div className="w-44 rounded-3xl border border-sky-500/30 bg-sky-500/10 p-6 text-center">

              <div className="text-xs uppercase tracking-[0.35em] text-sky-400">
                OVR
              </div>

              <div className="mt-2 text-7xl font-black leading-none text-white">
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