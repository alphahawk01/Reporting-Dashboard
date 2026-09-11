"use client";

import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export type TrendPoint = {
  idx: number;
  label: string;
  accuracy: number;
};

// Bar fill by the same % bands used across the tables:
//   >= 90% green, >= 70% amber, else red. (accuracy is 0–100 here.)
function bandColor(accuracy: number): string {
  if (accuracy >= 90) return "#059669"; // emerald-600
  if (accuracy >= 70) return "#d97706"; // amber-600
  return "#dc2626"; // red-600
}

// Least-squares linear trend line over the accuracy points. Returns a `trend`
// value per point so recharts can draw a straight line through the columns.
function withTrend(data: TrendPoint[]): (TrendPoint & { trend: number })[] {
  const n = data.length;
  if (n === 0) return [];
  if (n === 1) return [{ ...data[0], trend: data[0].accuracy }];

  const xs = data.map((_, i) => i);
  const ys = data.map((d) => d.accuracy);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return data.map((d, i) => ({
    ...d,
    trend: Math.max(0, Math.min(100, intercept + slope * i)),
  }));
}

/**
 * Accuracy-over-time chart for a selected analyst: a column per check plus a
 * straight least-squares trend line. Extracted into its own component so the
 * heavy recharts dependency is lazily loaded via next/dynamic.
 */
export default function AccuracyTrendChart({ data }: { data: TrendPoint[] }) {
  const chartData = withTrend(data);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={chartData}
        margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
      >
        <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
        <XAxis dataKey="idx" tick={{ fontSize: 11, fill: "#64748B" }} />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "#64748B" }}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          formatter={(v: any, name: any) => [
            `${Number(v).toFixed(1)}%`,
            name === "Trend" ? "Trend" : "Accuracy",
          ]}
          labelFormatter={(_l, p) => (p?.[0]?.payload?.label ?? "")}
        />
        <Bar
          dataKey="accuracy"
          name="Accuracy"
          radius={[3, 3, 0, 0]}
          maxBarSize={48}
        >
          {chartData.map((d) => (
            <Cell key={d.idx} fill={bandColor(d.accuracy)} />
          ))}
        </Bar>
        <Line
          type="linear"
          dataKey="trend"
          name="Trend"
          stroke="#0f172a"
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={false}
          activeDot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
