"use client";

import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
} from "recharts";

import type { AnalystMetrics } from "@/types/analyst";

type Props = {
  analystA?: AnalystMetrics;
  analystB?: AnalystMetrics;
};

export default function ComparisonRadar({
  analystA,
  analystB,
}: Props) {
  if (!analystA || !analystB) {
    return (
      <div className="rounded-xl border border-slate-700 bg-[#0f172a] p-8 text-center text-slate-400">
        Select two analysts to compare.
      </div>
    );
  }

  const data = [
    {
      attribute: "Speed",
      A: analystA.ratings.speed,
      B: analystB.ratings.speed,
    },
    {
      attribute: "Efficiency",
      A: analystA.ratings.efficiency,
      B: analystB.ratings.efficiency,
    },
    {
      attribute: "Experience",
      A: analystA.ratings.experience,
      B: analystB.ratings.experience,
    },
    {
      attribute: "Work Rate",
      A: analystA.ratings.workRate,
      B: analystB.ratings.workRate,
    },
    {
      attribute: "Consistency",
      A: analystA.ratings.consistency,
      B: analystB.ratings.consistency,
    },
    {
      attribute: "Versatility",
      A: analystA.ratings.versatility,
      B: analystB.ratings.versatility,
    },
    {
      attribute: "Knowledge",
      A: analystA.ratings.knowledge,
      B: analystB.ratings.knowledge,
    },
  ];

  return (
    <div className="rounded-xl border border-slate-700 bg-[#0f172a] p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-white">
          Performance Radar
        </h2>

        <p className="mt-2 text-slate-400">
          Compare every performance attribute side-by-side.
        </p>
      </div>

      <div className="h-[520px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="75%">
            <PolarGrid stroke="#334155" />

            <PolarAngleAxis
              dataKey="attribute"
              tick={{
                fill: "#cbd5e1",
                fontSize: 14,
              }}
            />

            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{
                fill: "#64748b",
                fontSize: 12,
              }}
            />

            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 12,
                color: "#fff",
              }}
            />

            <Legend
              wrapperStyle={{
                color: "#fff",
                paddingTop: 20,
              }}
            />

            <Radar
              name={analystA.name}
              dataKey="A"
              stroke="#38bdf8"
              fill="#38bdf8"
              fillOpacity={0.35}
              strokeWidth={3}
            />

            <Radar
              name={analystB.name}
              dataKey="B"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.3}
              strokeWidth={3}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}