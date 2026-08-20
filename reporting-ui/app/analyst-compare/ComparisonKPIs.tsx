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
  format: (v: number) => string;
};

function KPIBox({
  title,
  a,
  b,
  higher,
  format,
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
    <div className="flex flex-col rounded-xl border border-slate-700 bg-[#0f172a] p-5">

      <div className="text-sm font-medium text-slate-400">
        {title}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">

        <div className="min-w-0 rounded-lg bg-slate-900 p-3 text-center">
          <div className="truncate text-xs text-slate-400" title={analystA.name}>
            {analystA.name}
          </div>

          <div className="mt-2 text-xl font-bold text-white">
            {format(a)}
          </div>
        </div>

        <div className="min-w-0 rounded-lg bg-slate-900 p-3 text-center">
          <div className="truncate text-xs text-slate-400" title={analystB.name}>
            {analystB.name}
          </div>

          <div className="mt-2 text-xl font-bold text-white">
            {format(b)}
          </div>
        </div>

      </div>

      <div className="mt-4 flex justify-center">

        {winner ? (
          <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-emerald-500/20 px-4 py-1 text-sm font-semibold text-emerald-300">
            🏆 <span className="truncate">{winner.name}</span>
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-slate-700 px-4 py-1 text-sm text-slate-300">
            Draw
          </span>
        )}

      </div>

    </div>
  );
}

const asInt = (v: number) => Math.round(v).toString();
const asDecimal = (v: number) => v.toFixed(2);
const asCurrency = (v: number) =>
  `$${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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
      format: asInt,
    },
    {
      title: "Games",
      a: analystA.totalGames,
      b: analystB.totalGames,
      higher: true,
      format: asDecimal,
    },
    {
      title: "Hours / Game",
      a: analystA.avgHoursPerGame,
      b: analystB.avgHoursPerGame,
      higher: false,
      format: asDecimal,
    },
    {
      title: "Cost / Game",
      a: analystA.avgCostPerGame,
      b: analystB.avgCostPerGame,
      higher: false,
      format: asCurrency,
    },
    {
      title: "Cost / Hour",
      a: analystA.costPerHour,
      b: analystB.costPerHour,
      higher: false,
      format: asCurrency,
    },
    {
      title: "Games / Week",
      a: analystA.avgGamesPerWeek,
      b: analystB.avgGamesPerWeek,
      higher: true,
      format: asDecimal,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">

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