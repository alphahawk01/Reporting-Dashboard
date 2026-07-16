"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
} from "recharts";

// -------------------------
// THEME
// -------------------------
const THEME = {
  bg: "#0b1220",
  panel: "#0f1b2d",
  panelSoft: "#111f35",
  border: "rgba(148,163,184,0.15)",
  text: "#e5e7eb",
  muted: "#94a3b8",
  accent: "#38bdf8",
  success: "#22c55e",
  warn: "#f59e0b",
  danger: "#ef4444",
};

export default function HoursByEmployee({ data }: { data: any[] }) {
  const [selectedArea, setSelectedArea] = useState<string>("All");

  const areas = useMemo(() => {
    const set = new Set<string>();
    data.forEach((row) => {
      if (row.area_name) set.add(row.area_name);
    });
    return ["All", ...Array.from(set)];
  }, [data]);

  const filteredData = useMemo(() => {
    if (selectedArea === "All") return data;
    return data.filter((row) => row.area_name === selectedArea);
  }, [data, selectedArea]);

  const grouped = useMemo(() => {
    return Object.values(
      filteredData.reduce((acc: any, row) => {
        const name = row.employee_name || "Unknown";

        if (!acc[name]) acc[name] = { name, hours: 0 };

        acc[name].hours += Number(row.total_hours) || 0;

        return acc;
      }, {})
    ).sort((a: any, b: any) => b.hours - a.hours);
  }, [filteredData]);

  return (
    <div
      style={{
        background: THEME.panel,
        borderRadius: 16,
        padding: 20,
        border: `1px solid ${THEME.border}`,
        boxShadow: "0 10px 35px rgba(0,0,0,0.35)",
        width: "100%",
        minHeight: 420,
        overflowX: "auto",
        color: THEME.text,
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: THEME.text }}>
            Hours by Employee
          </div>
          <div style={{ fontSize: 12, color: THEME.muted }}>
            Employee hours (filtered by area)
          </div>
        </div>

        {/* FILTER */}
        <select
          value={selectedArea}
          onChange={(e) => setSelectedArea(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 10,
            border: `1px solid ${THEME.border}`,
            fontSize: 12,
            color: THEME.text,
            background: THEME.panelSoft,
            outline: "none",
            cursor: "pointer",
          }}
        >
          {areas.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
      </div>

      {/* CHART WRAPPER */}
      <div
        style={{
          width: `${Math.max(grouped.length * 70, 15 * 70)}px`,
          height: 380,
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
<BarChart
  data={grouped}
  margin={{ top: 20, right: 20, left: 10, bottom: 10 }}
>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={THEME.border}
              vertical={false}
            />

            <XAxis
              dataKey="name"
              interval={0}
              angle={-35}
              textAnchor="end"
              height={80}
              tick={{ fontSize: 11, fill: THEME.muted }}
            />

            <YAxis
              tick={{ fontSize: 11, fill: THEME.muted }}
              axisLine={false}
              tickLine={false}
            />

            <Tooltip
              formatter={(value) => [
                Number(value).toFixed(2),
                "Hours",
              ]}
              contentStyle={{
                borderRadius: 12,
                border: `1px solid ${THEME.border}`,
                boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                background: THEME.panelSoft,
                color: THEME.text,
              }}
              labelStyle={{ color: THEME.text }}
              cursor={{ fill: "rgba(56,189,248,0.08)" }}
            />

            <Bar dataKey="hours" fill={THEME.accent} radius={[6, 6, 0, 0]}>
<LabelList
  dataKey="hours"
  position="top"
  dy={-6}
  formatter={(value: any) =>
    Number(value || 0).toFixed(1)
  }
  style={{
    fill: THEME.text,
    fontSize: 11,
    pointerEvents: "none",
  }}
/>
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}