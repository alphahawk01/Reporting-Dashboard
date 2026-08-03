"use client";

import type { AnalystMetrics } from "@/types/analyst";

type Props = {
  analystA: AnalystMetrics;
  analystB: AnalystMetrics;
};

type KPI = {
  title: string;
  a: number;
  b: number;
  higher: boolean;
};

function KPIBox({
  title,
  a,
  b,
  higher,
  analystA,
  analystB,
}: KPI & Props) {
  const winner =
    higher
      ? a > b
        ? analystA
        : b > a
        ? analystB
        : null
      : a < b
      ? analystA
      : b < a
      ? analystB
      : null;

  return (
    <div className="rounded-xl border border-slate-700 bg-[#0f172a] p-5">

      <div className="text-sm text-slate-400">
        {title}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">

        <div className="rounded-lg bg-slate-900 p-4 text-center">
          <div className="text-xs text-slate-400">
            {analystA.name}
          </div>

          <div className="mt-2 text-2xl font-bold">
            {a.toFixed(2)}
          </div>
        </div>

        <div className="rounded-lg bg-slate-900 p-4 text-center">
          <div className="text-xs text-slate-400">
            {analystB.name}
          </div>

          <div className="mt-2 text-2xl font-bold">
            {b.toFixed(2)}
          </div>
        </div>

      </div>

      <div className="mt-4 text-center">

        {winner ? (
          <span className="inline-flex rounded-full bg-emerald-500/20 px-4 py-1 text-sm font-semibold text-emerald-300">
            🏆 {winner.name}
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-slate-700 px-4 py-1 text-sm">
            Draw
          </span>
        )}

      </div>

    </div>
  );
}

export default function ComparisonKPIs({
  analystA,
  analystB,
}: Props) {

  const cards: KPI[] = [
    {
      title: "Overall Rating",
      a: analystA.ratings.overall,
      b: analystB.ratings.overall,
      higher: true,
    },
    {
      title: "Games",
      a: analystA.totalGames,
      b: analystB.totalGames,
      higher: true,
    },
    {
      title: "Hours / Game",
      a: analystA.avgHoursPerGame,
      b: analystB.avgHoursPerGame,
      higher: false,
    },
    {
      title: "Cost / Game",
      a: analystA.avgCostPerGame,
      b: analystB.avgCostPerGame,
      higher: false,
    },
    {
      title: "Cost / Hour",
      a: analystA.costPerHour,
      b: analystB.costPerHour,
      higher: false,
    },
    {
      title: "Games / Week",
      a: analystA.avgGamesPerWeek,
      b: analystB.avgGamesPerWeek,
      higher: true,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-6">

      {cards.map((card) => (
        <KPIBox
          key={card.title}
          {...card}
          analystA={analystA}
          analystB={analystB}
        />
      ))}

    </div>
  );
}