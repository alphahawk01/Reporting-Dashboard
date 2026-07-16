"use client";

import { useMemo, useState } from "react";

// -------------------------
const THEME = {
  bg: "#0b1220",
  panel: "#0f1b2d",
  panelSoft: "#111f35",
  border: "rgba(148,163,184,0.15)",
  text: "#e5e7eb",
  muted: "#94a3b8",
  accent: "#38bdf8",
};

// -------------------------
const LEVELS = {
  games: [3.5, 4, 5],
  avgTime: [6.75, 6.25, 5.75],
  avgCost: [205, 185, 165],
};

const BONUS = {
  1: 25,
  2: 35,
  3: 50,
};

// -------------------------
function getLevel(value: number, thresholds: number[], inverse = false) {
  if (!inverse) {
    if (value >= thresholds[2]) return 3;
    if (value >= thresholds[1]) return 2;
    if (value >= thresholds[0]) return 1;
    return 0;
  } else {
    if (value <= thresholds[2]) return 3;
    if (value <= thresholds[1]) return 2;
    if (value <= thresholds[0]) return 1;
    return 0;
  }
}

// -------------------------
const toDate = (v: any) => {
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

// -------------------------
function getUniqueWeeks(data: any[]) {
  const map = new Map<string, { start: Date; end: Date }>();

  (data ?? []).forEach((d) => {
    const date = toDate(d.shift_date);
    if (!date) return;

    // normalize week start (Monday-based grouping)
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
    const start = new Date(date);
    start.setDate(date.getDate() + diff);
    start.setHours(0, 0, 0, 0);

    const key = start.toISOString().slice(0, 10);

    if (!map.has(key)) {
      const end = new Date(start);
      end.setDate(end.getDate() + 6);

      map.set(key, { start, end });
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
}

// -------------------------
export default function BonusTracker({ data }: { data: any[] }) {
  const [week, setWeek] = useState("all");

  const weeks = useMemo(() => getUniqueWeeks(data), [data]);

  const rows = useMemo(() => {
    const grouped: Record<string, any> = {};

    const activeRange =
      week === "all" ? null : weeks[Number(week)];

    (data ?? []).forEach((d) => {
      const date = toDate(d.shift_date);
      if (!date) return;

      // safe filter
      if (activeRange) {
        if (date < activeRange.start || date > activeRange.end) return;
      }

      const key = d.employee_name;
      if (!key) return;

      if (!grouped[key]) {
        grouped[key] = {
          employee_name: key,
          games: 0,
          hours: 0,
          cost: 0,
        };
      }

      grouped[key].games += Number(d.games || 0);
      grouped[key].hours += Number(d.totalHours || 0);
      grouped[key].cost += Number(d.totalCost || 0);
    });

    return Object.values(grouped)
      .map((r: any) => {
        const avgTime = r.games ? r.hours / r.games : 0;
        const avgCost = r.games ? r.cost / r.games : 0;

        const gameLevel = getLevel(r.games, LEVELS.games);
        const timeLevel = getLevel(avgTime, LEVELS.avgTime, true);
        const costLevel = getLevel(avgCost, LEVELS.avgCost, true);

        return {
          ...r,
          avgTime,
          avgCost,
          totalBonus:
            (BONUS[gameLevel as 1] || 0) +
            (BONUS[timeLevel as 1] || 0) +
            (BONUS[costLevel as 1] || 0),
        };
      })
      .filter((r: any) => r.games > 0 || r.hours > 0 || r.cost > 0);
  }, [data, week, weeks]);

  return (
    <div style={{ padding: 16, color: THEME.text }}>
      {/* HEADER */}
      <div style={{ display: "flex", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Bonus Tracker</h2>

        <select
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          style={{
            marginLeft: "auto",
            padding: 6,
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            color: THEME.text,
            borderRadius: 8,
          }}
        >
          <option value="all">All Weeks</option>

          {weeks.map((w, i) => (
            <option key={i} value={i}>
              Week {i + 1}
            </option>
          ))}
        </select>
      </div>

      {/* TABLE */}
      <div
        style={{
          background: THEME.panel,
          border: `1px solid ${THEME.border}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: THEME.panelSoft }}>
            <tr>
              <th>Employee</th>
              <th>Games</th>
              <th>Avg Time</th>
              <th>Avg Cost</th>
              <th>Total Bonus</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 12, color: THEME.muted }}>
                  No data available
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.employee_name}</td>
                  <td>{r.games.toFixed(1)}</td>
                  <td>{r.avgTime.toFixed(2)}</td>
                  <td>${r.avgCost.toFixed(2)}</td>
                  <td style={{ color: THEME.accent, fontWeight: 700 }}>
                    ${r.totalBonus}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}