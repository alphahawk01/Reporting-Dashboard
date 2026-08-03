"use client";

import type { AnalystMetrics } from "@/types/analyst";

type Props = {
  analysts: AnalystMetrics[];
  analystA: AnalystMetrics;
  analystB: AnalystMetrics;
};

function rank(
  analysts: AnalystMetrics[],
  key: keyof AnalystMetrics["ratings"]
) {
  return [...analysts]
    .sort((a, b) => b.ratings[key] - a.ratings[key])
    .map((a) => a.name);
}

function RankCard({
  title,
  rankA,
  rankB,
  total,
  analystA,
  analystB,
}: {
  title: string;
  rankA: number;
  rankB: number;
  total: number;
  analystA: string;
  analystB: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
      <h3 className="mb-4 text-lg font-semibold">{title}</h3>

      <div className="space-y-3">

        <div className="flex justify-between">
          <span>{analystA}</span>
          <span className="font-bold">
            #{rankA} / {total}
          </span>
        </div>

        <div className="flex justify-between">
          <span>{analystB}</span>
          <span className="font-bold">
            #{rankB} / {total}
          </span>
        </div>

      </div>
    </div>
  );
}

export default function ComparisonRanking({
  analysts,
  analystA,
  analystB,
}: Props) {
  const overall = rank(analysts, "overall");
  const speed = rank(analysts, "speed");
  const efficiency = rank(analysts, "efficiency");
  const consistency = rank(analysts, "consistency");

  const total = analysts.length;

  return (
    <div className="rounded-xl border border-slate-700 bg-[#0f172a] p-8">

      <h2 className="mb-8 text-2xl font-semibold">
        Company Rankings
      </h2>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">

        <RankCard
          title="Overall"
          analystA={analystA.name}
          analystB={analystB.name}
          rankA={overall.indexOf(analystA.name) + 1}
          rankB={overall.indexOf(analystB.name) + 1}
          total={total}
        />

        <RankCard
          title="Speed"
          analystA={analystA.name}
          analystB={analystB.name}
          rankA={speed.indexOf(analystA.name) + 1}
          rankB={speed.indexOf(analystB.name) + 1}
          total={total}
        />

        <RankCard
          title="Efficiency"
          analystA={analystA.name}
          analystB={analystB.name}
          rankA={efficiency.indexOf(analystA.name) + 1}
          rankB={efficiency.indexOf(analystB.name) + 1}
          total={total}
        />

        <RankCard
          title="Consistency"
          analystA={analystA.name}
          analystB={analystB.name}
          rankA={consistency.indexOf(analystA.name) + 1}
          rankB={consistency.indexOf(analystB.name) + 1}
          total={total}
        />

      </div>

    </div>
  );
}