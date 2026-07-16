"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

const THEME = {
  text: "#cbd5e1",
  muted: "#94a3b8",
  grid: "#1e293b",
  line: "#3b82f6",
};

// -------------------------
// CUSTOM TOOLTIP
// -------------------------
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  const hours = payload[0].value;

  return (
    <div
      style={{
        background: "#0f1b2d",
        border: "1px solid #1e293b",
        padding: "10px 12px",
        borderRadius: "10px",
        color: "#e2e8f0",
        fontSize: "12px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
      }}
    >
      <div style={{ color: "#94a3b8", marginBottom: 4 }}>
        Week
      </div>

      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <span style={{ color: "#94a3b8" }}>Hours:</span>
        <span style={{ color: "#3b82f6", fontWeight: 600 }}>
          {Number(hours).toFixed(1)}
        </span>
      </div>
    </div>
  );
};

type Props = {
  deputyData: any[];
};

export default function HoursPerWeekTrend({
  deputyData,
}: Props) {

  // -------------------------
  // GROUP BY WEEK (TOTAL HOURS)
  // -------------------------
  const data = useMemo(() => {
    const weeks: Record<string, number> = {};

    deputyData.forEach((shift) => {
      const week =
        shift.week ||
        shift.weekEnding ||
        shift.week_ending;

      if (!week) return;

      if (!weeks[week]) {
        weeks[week] = 0;
      }

      weeks[week] += Number(
        shift.hours ||
          shift.total_hours ||
          shift.shift_hours ||
          0
      );
    });

    return Object.entries(weeks)
      .map(([week, hours]) => ({
        week,
        hours,
      }))
      .sort(
        (a, b) =>
          new Date(a.week).getTime() -
          new Date(b.week).getTime()
      );
  }, [deputyData]);

  // -------------------------
  // OVERALL AVG HOURS / WEEK
  // -------------------------
  const overallAvgHours = useMemo(() => {
    if (!data.length) return 0;

    const total = data.reduce(
      (sum, w) => sum + w.hours,
      0
    );

    return total / data.length;
  }, [data]);

  return (
    <div className="h-full flex flex-col">

      {/* KPI HEADER */}
      <div className="mb-2">
        <div
          style={{
            display: "inline-block",
            padding: "8px 12px",
            borderRadius: 8,
            background: "#0f1b2d",
            border: "1px solid #1e293b",
          }}
        >
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Overall Avg Hours / Week
          </div>

          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#3b82f6",
            }}
          >
            {overallAvgHours.toFixed(2)}
          </div>
        </div>
      </div>

      {/* CHART */}
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke={THEME.grid} />

            <XAxis dataKey="week" stroke={THEME.text} />
            <YAxis stroke={THEME.text} />

            <Tooltip content={<CustomTooltip />} />

            <Line
              type="monotone"
              dataKey="hours"
              stroke={THEME.line}
              strokeWidth={3}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}