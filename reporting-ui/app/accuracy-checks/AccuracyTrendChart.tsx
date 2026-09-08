"use client";

import {
  LineChart,
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

/**
 * Accuracy-over-time line chart for a selected analyst. Extracted into its own
 * component so it (and the heavy recharts dependency) can be lazily loaded via
 * next/dynamic from the accuracy-checks page.
 */
export default function AccuracyTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
        <XAxis dataKey="idx" tick={{ fontSize: 11, fill: "#64748B" }} />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "#64748B" }}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          formatter={(v: any) => [`${v}%`, "Accuracy"]}
          labelFormatter={(_l, p) => (p?.[0]?.payload?.label ?? "")}
        />
        <Line
          type="monotone"
          dataKey="accuracy"
          stroke="#dc2626"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
