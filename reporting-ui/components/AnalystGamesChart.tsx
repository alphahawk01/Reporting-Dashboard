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
} from "recharts";

type Props = {
  data: any[]; // ttData
};

const norm = (v: any) =>
  String(v ?? "").trim().toLowerCase();

export default function AnalystGamesChart({ data }: Props) {
  const [view, setView] = useState<"all" | "week">("all");
  const [selectedWeek, setSelectedWeek] = useState("all");

  // -------------------------
  // NORMALISE TT DATA
  // -------------------------
  const rows = useMemo(() => {
    return (data ?? []).map((r) => ({
      week: String(r.week ?? "").trim(),
      home: norm(r.home_allocated),
      away: norm(r.away_allocated),
    }));
  }, [data]);

  // -------------------------
  // WEEK OPTIONS
  // -------------------------
  const weeks = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.week).filter(Boolean)))
      .sort((a, b) => Number(a) - Number(b));
  }, [rows]);

  // -------------------------
  // BUILD ANALYST GAME COUNT (SAME LOGIC AS INSIGHTS)
  // -------------------------
  const chartData = useMemo(() => {
    const map = new Map<string, number>();

    rows.forEach((r) => {
      if (view === "week" && selectedWeek !== "all" && r.week !== selectedWeek) {
        return;
      }

      if (r.home) {
        map.set(r.home, (map.get(r.home) || 0) + 0.5);
      }

      if (r.away) {
        map.set(r.away, (map.get(r.away) || 0) + 0.5);
      }
    });

    return Array.from(map.entries()).map(([name, games]) => ({
      name,
      games,
    }));
  }, [rows, view, selectedWeek]);

  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex justify-between mb-3">
        <h3 className="font-semibold">Games by Analyst</h3>

        <div className="flex gap-2">
          <select
            className="border rounded px-2 py-1 text-sm"
            value={view}
            onChange={(e) => setView(e.target.value as any)}
          >
            <option value="all">All</option>
            <option value="week">By Week</option>
          </select>

          {view === "week" && (
            <select
              className="border rounded px-2 py-1 text-sm"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
            >
              <option value="all">All Weeks</option>
              {weeks.map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div style={{ width: "100%", height: 350 }}>
        <ResponsiveContainer>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="games" fill="#6366f1" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}