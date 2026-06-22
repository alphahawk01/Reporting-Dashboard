"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

import { getTTAllocations } from "@/lib/ttCalculations";

// -------------------------
// HELPERS
// -------------------------
const norm = (v: any) =>
  String(v ?? "")
    .trim()
    .toLowerCase();

const title = (v: string) =>
  (v || "")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export default function TTGames({ data }: { data: any[] }) {
  // -------------------------
  // LOCAL FILTER STATE
  // -------------------------
  const [week, setWeek] = useState("all");
  const [month, setMonth] = useState("all");
  const [analyst, setAnalyst] = useState("all");

  // -------------------------
  // NORMALISE ROWS
  // -------------------------
  const rows = useMemo(() => {
    return (data ?? []).map((r) => ({
      week: String(r.week ?? r.Week ?? "").trim(),
      month: norm(r.column11 ?? r.Column11),
      home: norm(r.home_allocated),
      away: norm(r.away_allocated),
      location: norm(r.location ?? r.Location),
    }));
  }, [data]);

  // -------------------------
  // UNIQUE FILTER OPTIONS (FIXED + SORTED)
  // -------------------------
  const analysts = useMemo(() => {
    const set = new Set<string>();

    rows.forEach((r) => {
      if (r.home) set.add(r.home);
      if (r.away) set.add(r.away);
    });

    return Array.from(set)
      .sort()
      .map((v) => ({
        key: v,
        label: title(v),
      }));
  }, [rows]);

  const weeks = useMemo(() => {
    const set = new Set(rows.map((r) => r.week).filter(Boolean));
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [rows]);

  const months = useMemo(() => {
    const set = new Set(rows.map((r) => r.month).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  // -------------------------
  // FILTERED DATA (FIXED LOGIC)
  // -------------------------
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchWeek = week === "all" || r.week === week;
      const matchMonth = month === "all" || r.month === norm(month);

      const matchAnalyst =
        analyst === "all" ||
        r.home === analyst ||
        r.away === analyst;

      return matchWeek && matchMonth && matchAnalyst;
    });
  }, [rows, week, month, analyst]);

  // -------------------------
  // GROUP BY WEEK
  // -------------------------
  const chartData = useMemo(() => {
  const map = new Map<any, any>();

  const seenGames = new Set<string>();

  filtered.forEach((r) => {
    const key = r.week || "Unknown";

    // 🔥 DEFINE A UNIQUE GAME KEY
    const gameKey = `${r.week}-${r.home}-${r.away}-${r.location}`;

    const existing =
      map.get(key) ?? { week: key, AUS: 0, PHL: 0, Mixed: 0, games: 0 };

    // Only count game once
    if (!seenGames.has(gameKey)) {
      existing.games += 1;
      seenGames.add(gameKey);
    }

    const isAus = r.location.includes("aus");
    const isPhl = r.location.includes("phl");

    if (isAus && isPhl) existing.Mixed++;
    else if (isAus) existing.AUS++;
    else if (isPhl) existing.PHL++;

    map.set(key, existing);
  });

  return Array.from(map.values()).sort(
    (a, b) => Number(a.week) - Number(b.week)
  );
}, [filtered]);
  // -------------------------
  // SUMMARY
  // -------------------------
 const summary = useMemo(() => {
  return chartData.reduce(
    (acc, w) => {
      acc.AUS += w.AUS;
      acc.PHL += w.PHL;
      acc.Mixed += w.Mixed;
      acc.games += w.games || 0;
      return acc;
    },
    { AUS: 0, PHL: 0, Mixed: 0, games: 0 }
  );
}, [chartData]);

const total = chartData.reduce((acc, w) => acc + (w.games || 0), 0);
  // -------------------------
  // UI COMPONENTS
  // -------------------------
  const Kpi = ({ label, value, color }: any) => (
    <div className="p-4 bg-white border rounded-xl shadow-sm flex-1">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active) return null;

    return (
      <div className="bg-white border rounded-lg p-3 text-sm shadow">
        <div className="font-semibold mb-1">Week {label}</div>
        {payload?.map((p: any) => (
          <div key={p.name}>
            {p.name}: <b>{p.value}</b>
          </div>
        ))}
      </div>
    );
  };

  // -------------------------
  // UI
  // -------------------------
  return (
    <div className="bg-gray-50 p-4 rounded-2xl border space-y-4">

      {/* HEADER */}
      <div>
        <h2 className="text-lg font-bold">TT Games</h2>
        <p className="text-xs text-gray-500">
          Allocation breakdown by week
        </p>
      </div>

      {/* FILTER BAR */}
      <div className="flex flex-wrap gap-2">

        <select
          className="border rounded-lg px-3 py-1 text-sm"
          value={week}
          onChange={(e) => setWeek(e.target.value)}
        >
          <option value="all">All Weeks</option>
          {weeks.map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>

        <select
          className="border rounded-lg px-3 py-1 text-sm"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        >
          <option value="all">All Months</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {title(m)}
            </option>
          ))}
        </select>

        <select
          className="border rounded-lg px-3 py-1 text-sm"
          value={analyst}
          onChange={(e) => setAnalyst(e.target.value)}
        >
          <option value="all">All Analysts</option>
          {analysts.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      {/* KPI ROW */}
      <div className="flex gap-3">
<Kpi label="Total Games" value={summary.games} />
        <Kpi label="AUS" value={summary.AUS} color="#22c55e" />
        <Kpi label="PHL" value={summary.PHL} color="#f59e0b" />
        <Kpi label="Mixed" value={summary.Mixed} color="#8b5cf6" />
      </div>

      {/* CHART */}
      <div className="bg-white border rounded-xl p-3 h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="week" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />

            <Bar dataKey="AUS" stackId="a" fill="#22c55e" />
            <Bar dataKey="PHL" stackId="a" fill="#f59e0b" />
            <Bar dataKey="Mixed" stackId="a" fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}