"use client";

import type { AnalystMetrics } from "@/types/analyst";

type Props = {
  analystA: AnalystMetrics;
  analystB: AnalystMetrics;
};

export default function ComparisonSummary({
  analystA,
  analystB,
}: Props) {
  const comparisons = [
    {
      label: "Overall Rating",
      a: analystA.ratings.overall,
      b: analystB.ratings.overall,
      higher: true,
    },
    {
      label: "Games",
      a: analystA.totalGames,
      b: analystB.totalGames,
      higher: true,
    },
    {
      label: "Hours / Game",
      a: analystA.avgHoursPerGame,
      b: analystB.avgHoursPerGame,
      higher: false,
    },
    {
      label: "Cost / Game",
      a: analystA.avgCostPerGame,
      b: analystB.avgCostPerGame,
      higher: false,
    },
    {
      label: "Cost / Hour",
      a: analystA.costPerHour,
      b: analystB.costPerHour,
      higher: false,
    },
    {
      label: "Games / Week",
      a: analystA.avgGamesPerWeek,
      b: analystB.avgGamesPerWeek,
      higher: true,
    },
    {
      label: "Hours / Week",
      a: analystA.avgHoursPerWeek,
      b: analystB.avgHoursPerWeek,
      higher: true,
    },
  ];

  let winsA = 0;
  let winsB = 0;

  comparisons.forEach((kpi) => {
    if (kpi.higher) {
      if (kpi.a > kpi.b) winsA++;
      else if (kpi.b > kpi.a) winsB++;
    } else {
      if (kpi.a < kpi.b) winsA++;
      else if (kpi.b < kpi.a) winsB++;
    }
  });

  const winner =
    winsA > winsB
      ? analystA
      : winsB > winsA
      ? analystB
      : null;

  const strengths = (analyst: AnalystMetrics) =>
    Object.entries(analyst.ratings)
      .filter(([key]) => key !== "overall")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key]) =>
        key
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (c) => c.toUpperCase())
      );

  return (
    <div className="rounded-xl border border-slate-700 bg-[#0f172a] p-8">
      <h2 className="text-2xl font-bold mb-6">
        Executive Comparison Summary
      </h2>

      <div className="grid grid-cols-3 gap-8">

        <div>
          <h3 className="text-slate-400 text-sm mb-2">
            Overall Winner
          </h3>

          {winner ? (
            <>
              <div className="text-3xl font-bold text-emerald-400">
                🏆 {winner.name}
              </div>

              <p className="text-slate-400 mt-2">
                Won{" "}
                <span className="font-semibold text-white">
                  {Math.max(winsA, winsB)}
                </span>{" "}
                of {comparisons.length} KPIs.
              </p>
            </>
          ) : (
            <div className="text-xl text-slate-300">
              Dead Heat
            </div>
          )}
        </div>

        <div>
          <h3 className="text-slate-400 text-sm mb-3">
            {analystA.name}
          </h3>

          <ul className="space-y-2">
            {strengths(analystA).map((item) => (
              <li key={item}>
                ✅ {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-slate-400 text-sm mb-3">
            {analystB.name}
          </h3>

          <ul className="space-y-2">
            {strengths(analystB).map((item) => (
              <li key={item}>
                ✅ {item}
              </li>
            ))}
          </ul>
        </div>

      </div>

      <div className="mt-8 rounded-lg bg-slate-900 p-5 border border-slate-700">
        <h3 className="font-semibold mb-2">
          Recommendation
        </h3>

        <p className="text-slate-300 leading-7">
          {winner
            ? `${winner.name} currently has the stronger overall performance profile based on KPI results. While both analysts have their own strengths, ${winner.name} leads across more measured performance indicators and would currently be the recommended analyst based on this comparison.`
            : "Both analysts are performing at a very similar level with no clear overall leader."}
        </p>
      </div>
    </div>
  );
}