"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const THEME = {
  bg: "#0b1220",
  panel: "#0f1b2d",
  border: "rgba(148,163,184,0.15)",
  text: "#e5e7eb",
  muted: "#94a3b8",
  accent: "#38bdf8",
};

export default function TimeTrendCodingPerGame({
  deputyData,
  ttData,
}: {
  deputyData: any[];
  ttData: any[];
}) {
  const chartData = useMemo(() => {
    const map = new Map<string, { week: string; hours: number; games: number }>();

    // HOURS
    for (const r of deputyData || []) {
      const week = String(r.week ?? "").trim();
      if (!week) continue;

      const row = map.get(week) || { week, hours: 0, games: 0 };
      row.hours += Number(r.total_hours || 0);
      map.set(week, row);
    }

    // GAMES
    for (const r of ttData || []) {
      const week = String(r.Week ?? r.week ?? "").trim();
      if (!week) continue;

      const row = map.get(week) || { week, hours: 0, games: 0 };
      row.games += 1;
      map.set(week, row);
    }

    return Array.from(map.values())
      .sort((a, b) => Number(a.week) - Number(b.week))
      .map(w => ({
        week: w.week,
        avgCodingTimePerGame:
          w.games > 0 ? w.hours / w.games : 0,
      }));
  }, [deputyData, ttData]);

  return (
    <div
      style={{
        marginTop: 24,
        padding: 20,
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 12,
      }}
    >
      <h3 style={{ color: THEME.text, marginBottom: 10 }}>
        Weekly Avg Coding Time per Game
      </h3>

      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid stroke={THEME.border} />
            <XAxis dataKey="week" stroke={THEME.muted} />
            <YAxis stroke={THEME.muted} />

            <Tooltip />

            <Line
              type="monotone"
              dataKey="avgCodingTimePerGame"
              stroke={THEME.accent}
              strokeWidth={2}
              dot={true}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}