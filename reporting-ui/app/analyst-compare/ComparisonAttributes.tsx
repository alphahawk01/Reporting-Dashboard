"use client";

import type { AnalystMetrics } from "@/types/analyst";

type Props = {
  analystA: AnalystMetrics;
  analystB: AnalystMetrics;
};

const ATTRIBUTES = [
  { key: "speed", label: "Speed" },
  { key: "efficiency", label: "Efficiency" },
  { key: "consistency", label: "Consistency" },
  { key: "experience", label: "Experience" },
  { key: "knowledge", label: "Knowledge" },
  { key: "versatility", label: "Versatility" },
  { key: "workRate", label: "Work Rate" },
] as const;

export default function ComparisonAttributes({
  analystA,
  analystB,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-700 bg-[#0f172a] p-8">
      <h2 className="mb-8 text-2xl font-semibold">
        Attribute Comparison
      </h2>

      <div className="space-y-8">
        {ATTRIBUTES.map((attr) => {
          const a =
            analystA.ratings[
              attr.key as keyof typeof analystA.ratings
            ] as number;

          const b =
            analystB.ratings[
              attr.key as keyof typeof analystB.ratings
            ] as number;

          const winner =
            a > b
              ? analystA.name
              : b > a
              ? analystB.name
              : "Draw";

          return (
            <div key={attr.key}>
              <div className="mb-2 flex justify-between">
                <span className="font-medium">
                  {attr.label}
                </span>

                <span className="text-sm text-slate-400">
                  Winner: {winner}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-8">

                <div>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{analystA.name}</span>
                    <span>{a}</span>
                  </div>

                  <div className="h-3 rounded bg-slate-800">
                    <div
                      className="h-3 rounded bg-emerald-500"
                      style={{ width: `${a}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{analystB.name}</span>
                    <span>{b}</span>
                  </div>

                  <div className="h-3 rounded bg-slate-800">
                    <div
                      className="h-3 rounded bg-sky-500"
                      style={{ width: `${b}%` }}
                    />
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}