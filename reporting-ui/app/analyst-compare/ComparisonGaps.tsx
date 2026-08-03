"use client";

import type { AnalystMetrics } from "@/types/analyst";

type Props = {
  analystA: AnalystMetrics;
  analystB: AnalystMetrics;
};

const LABELS: Record<string, string> = {
  speed: "Speed",
  efficiency: "Efficiency",
  consistency: "Consistency",
  experience: "Experience",
  knowledge: "Knowledge",
  versatility: "Versatility",
  workRate: "Work Rate",
};

export default function ComparisonGaps({
  analystA,
  analystB,
}: Props) {
  const gaps = Object.entries(analystA.ratings)
    .filter(([key]) => key !== "overall")
    .map(([key, value]) => {
      const a = value;
      const b =
        analystB.ratings[
          key as keyof typeof analystB.ratings
        ] as number;

      return {
        key,
        label: LABELS[key] ?? key,
        a,
        b,
        gap: Math.abs(a - b),
        winner:
          a > b
            ? analystA.name
            : b > a
            ? analystB.name
            : "Draw",
      };
    })
    .sort((a, b) => b.gap - a.gap);

  return (
    <div className="rounded-xl border border-slate-700 bg-[#0f172a] p-8">
      <h2 className="mb-6 text-2xl font-semibold">
        Biggest Performance Gaps
      </h2>

      <div className="space-y-4">

        {gaps.map((item) => (
          <div
            key={item.key}
            className="rounded-lg border border-slate-700 bg-slate-900 p-4"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold">
                  {item.label}
                </div>

                <div className="text-sm text-slate-400">
                  {analystA.name}: {item.a} • {analystB.name}: {item.b}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xl font-bold">
                  {item.gap.toFixed(1)}
                </div>

                <div className="text-sm text-emerald-400">
                  {item.winner}
                </div>
              </div>
            </div>
          </div>
        ))}

      </div>
    </div>
  );
}