"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";

// -------------------------
// NORMALISER
// -------------------------
const norm = (v: any) =>
  String(v ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export default function AveHoursPerGame({
  deputyData,
  ttData,
}: {
  deputyData: any[];
  ttData: any[];
}) {
  const [analyst, setAnalyst] = useState("all");

  const selected = norm(analyst);
  const isAll = analyst === "all";

  // -------------------------
  // ANALYST LIST
  // -------------------------
  const analysts = useMemo(() => {
    const map = new Map<string, string>();

    (deputyData ?? []).forEach((r) => {
      const name = r.employee_name;
      if (!name) return;

      const key = norm(name);

      if (!map.has(key)) {
        map.set(key, name.trim());
      }
    });

    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [deputyData]);

  // -------------------------
  // CORE DATA BUILD
  // -------------------------
  const chartData = useMemo(() => {
    const weeks = new Map<
      string,
      { week: string; hours: number; games: number }
    >();

// -------------------------
// DEPUTY HOURS (FILTERED)
// -------------------------
(deputyData ?? []).forEach((r) => {
  const week = String(r.week ?? "").trim();
  if (!week) return;

  const area = String(r.area_name ?? "").trim();

  // ✅ ONLY INCLUDE VALID ANALYST WORK
  const allowed =
    area === "Home Analyst" ||
    area === "Office Analyst";

  if (!allowed) return;

  const match =
    isAll || norm(r.employee_name) === selected;

  if (!match) return;

  const existing = weeks.get(week) ?? {
    week,
    hours: 0,
    games: 0,
  };

  existing.hours += Number(r.total_hours ?? 0);

  weeks.set(week, existing);
});
    // -------------------------
    // TT GAMES
    // -------------------------
    (ttData ?? []).forEach((r) => {
      const week = String(r.week ?? r.Week ?? "").trim();
      if (!week) return;

      let gameCredit = 0;

      if (isAll) {
        gameCredit = 1;
      } else {
        if (norm(r.home_allocated) === selected) gameCredit += 1;
        if (norm(r.away_allocated) === selected) gameCredit += 1;

        gameCredit = gameCredit / 2;
      }

      const existing = weeks.get(week) ?? {
        week,
        hours: 0,
        games: 0,
      };

      existing.games += gameCredit;

      weeks.set(week, existing);
    });

    return Array.from(weeks.values())
      .sort((a, b) => Number(a.week) - Number(b.week))
      .map((w) => ({
        week: w.week,
        hours: Number(w.hours.toFixed(2)),
        games: Number(w.games.toFixed(2)),
        avg:
          w.games > 0
            ? Number((w.hours / w.games).toFixed(2))
            : 0,
      }));
  }, [deputyData, ttData, selected, isAll]);

  const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload;

  return (
    <div
      style={{
        background: "white",
        border: "1px solid #eee",
        padding: 12,
        borderRadius: 10,
        fontSize: 13,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        Week {label}
      </div>

      <div>Total Games: <b>{data.games.toFixed(2)}</b></div>
      <div>Total Hours: <b>{data.hours.toFixed(2)}</b></div>
      <div>Avg Hours/Game: <b>{data.avg.toFixed(2)}</b></div>
    </div>
  );
};
const overall = useMemo(() => {
  const totalHours = chartData.reduce((sum, w) => sum + w.hours, 0);
  const totalGames = chartData.reduce((sum, w) => sum + w.games, 0);

  return totalGames > 0 ? totalHours / totalGames : 0;
}, [chartData]);

  // -------------------------
  // UI
  // -------------------------
  return (
    <div
      style={{
        marginTop: 30,
        padding: 24,
        background: "white",
        border: "1px solid #eee",
        borderRadius: 16,
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      {/* HEADER */}
  <div style={{ marginBottom: 16 }}>
  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
    Avg Hours per Game
  </h2>

  <p style={{ margin: 0, fontSize: 12, color: "#666" }}>
    Deputy hours ÷ TT game allocations
  </p>

  {/* GLOBAL KPI */}
  <div
    style={{
      marginTop: 10,
      padding: "10px 12px",
      borderRadius: 10,
      background: "#f8fafc",
      border: "1px solid #eee",
      display: "inline-block",
    }}
  >
    <div style={{ fontSize: 12, color: "#666" }}>
      Overall Avg (selected analyst)
    </div>
    <div style={{ fontSize: 20, fontWeight: 700 }}>
      {overall.toFixed(2)} hrs/game
    </div>
  </div>
</div>

      {/* FILTER */}
      <div style={{ marginBottom: 16 }}>
        <select
          value={analyst}
          onChange={(e) => setAnalyst(e.target.value)}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
            fontSize: 13,
          }}
        >
          <option value="all">All Analysts</option>

          {analysts.map((a) => (
            <option key={a.key} value={a.label}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      {/* CHART */}
      <div style={{ height: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="week" />
            <YAxis />
<Tooltip content={<CustomTooltip />} />
<ReferenceLine
  y={overall}
  stroke="#ef4444"
  strokeDasharray="4 4"
  label="Avg"
/>
<Bar dataKey="avg" radius={[6, 6, 0, 0]}>
  {chartData.map((entry, index) => {
    const color =
      entry.avg <= overall ? "#22c55e" : "#ef4444";

    return <Cell key={`cell-${index}`} fill={color} />;
  })}
</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}