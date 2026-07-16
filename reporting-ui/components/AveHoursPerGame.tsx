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
  Cell,
  ReferenceLine,
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

  const SLA = 7;

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
    const weeks = new Map<string, { week: string; hours: number; games: number }>();

    (deputyData ?? []).forEach((r) => {
      const week = String(r.week ?? "").trim();
      if (!week) return;

      const area = String(r.area_name ?? "").trim();
      const allowed = area === "Home Analyst" || area === "Office Analyst";
      if (!allowed) return;

      const match = isAll || norm(r.employee_name) === selected;
      if (!match) return;

      const existing = weeks.get(week) ?? { week, hours: 0, games: 0 };

      existing.hours += Number(r.total_hours ?? 0);
      weeks.set(week, existing);
    });

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

      const existing = weeks.get(week) ?? { week, hours: 0, games: 0 };

      existing.games += gameCredit;
      weeks.set(week, existing);
    });

    return Array.from(weeks.values())
      .sort((a, b) => Number(a.week) - Number(b.week))
      .map((w) => ({
        week: w.week,
        hours: Number(w.hours.toFixed(2)),
        games: Number(w.games.toFixed(2)),
        avg: w.games > 0 ? Number((w.hours / w.games).toFixed(2)) : 0,
      }));
  }, [deputyData, ttData, selected, isAll]);

  // -------------------------
  // TOTALS
  // -------------------------
  const analystTotals = useMemo(() => {
    const totalGames = chartData.reduce((s, w) => s + w.games, 0);
    const totalHours = chartData.reduce((s, w) => s + w.hours, 0);
    return { games: totalGames, hours: totalHours };
  }, [chartData]);

  const analystAvg = useMemo(() => {
    const totalHours = chartData.reduce((s, w) => s + w.hours, 0);
    const totalGames = chartData.reduce((s, w) => s + w.games, 0);
    return totalGames > 0 ? totalHours / totalGames : 0;
  }, [chartData]);

  // -------------------------
  // TOOLTIP
  // -------------------------
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const data = payload[0]?.payload;

    return (
      <div
        style={{
          background: THEME.panel,
          border: `1px solid ${THEME.border}`,
          padding: 12,
          borderRadius: 10,
          fontSize: 12,
          color: THEME.text,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          Week {label}
        </div>

        <div>Total Games: <b>{data.games.toFixed(2)}</b></div>
        <div>Total Hours: <b>{data.hours.toFixed(2)}</b></div>

        <div>
          Hours/Game:{" "}
          <b
            style={{
              color:
                data.avg <= SLA ? THEME.success : THEME.danger,
            }}
          >
            {data.avg.toFixed(2)}
          </b>
        </div>
      </div>
    );
  };

  // -------------------------
  // UI
  // -------------------------
  return (
    <div
      style={{
        marginTop: 30,
        padding: 24,
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 16,
        color: THEME.text,
      }}
    >
      {/* HEADER */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
Weekly Average Hours per Game
        </h2>

        <p style={{ margin: 0, fontSize: 12, color: THEME.muted }}>
          Deputy hours ÷ TT game allocations
        </p>

        {/* KPI ROW */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 12,
            flexWrap: "wrap",
          }}
        >
          {/* SLA */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: THEME.panelSoft,
              border: `1px solid ${THEME.border}`,
              minWidth: 170,
            }}
          >
            <div style={{ fontSize: 12, color: THEME.muted }}>
              SLA Target
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {SLA.toFixed(1)} hrs/game
            </div>
          </div>

          {/* AVG */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: THEME.panelSoft,
              border: `1px solid ${THEME.border}`,
              minWidth: 170,
            }}
          >
            <div style={{ fontSize: 12, color: THEME.muted }}>
              Avg Hours / Game
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color:
                  analystAvg <= SLA ? THEME.success : THEME.danger,
              }}
            >
              {analystAvg.toFixed(2)}
            </div>
          </div>

          {!isAll && (
            <>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: THEME.panelSoft,
                  border: `1px solid ${THEME.border}`,
                  minWidth: 170,
                }}
              >
                <div style={{ fontSize: 12, color: THEME.muted }}>
                  Total Games
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {analystTotals.games.toFixed(1)}
                </div>
              </div>

              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: THEME.panelSoft,
                  border: `1px solid ${THEME.border}`,
                  minWidth: 170,
                }}
              >
                <div style={{ fontSize: 12, color: THEME.muted }}>
                  Total Hours
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  {analystTotals.hours.toFixed(1)}
                </div>
              </div>
            </>
          )}
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
            border: `1px solid ${THEME.border}`,
            fontSize: 13,
            background: THEME.panelSoft,
            color: THEME.text,
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
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={THEME.border}
            />

            <XAxis dataKey="week" stroke={THEME.muted} />
            <YAxis stroke={THEME.muted} />

            <Tooltip content={<CustomTooltip />} />

            <ReferenceLine
              y={SLA}
              stroke={THEME.danger}
              strokeDasharray="4 4"
              label={{ value: "SLA", fill: THEME.muted }}
            />

            <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={
                    entry.avg <= SLA
                      ? THEME.success
                      : THEME.danger
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}