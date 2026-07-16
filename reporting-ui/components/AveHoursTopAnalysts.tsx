"use client";

import { useMemo } from "react";

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
// NORMALISE
// -------------------------
const norm = (v: any) =>
  String(v ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export default function AveHoursTopAnalysts({
  deputyData,
  ttData,
}: {
  deputyData: any[];
  ttData: any[];
}) {
  const data = useMemo(() => {
    const map = new Map<
      string,
      { name: string; hours: number; games: number }
    >();

    const upsert = (name: string, hours = 0, games = 0) => {
      const key = norm(name);

      const existing = map.get(key) ?? {
        name,
        hours: 0,
        games: 0,
      };

      existing.hours += hours;
      existing.games += games;

      map.set(key, existing);
    };

    (deputyData ?? []).forEach((r) => {
      const area = String(r.area_name ?? "").trim();
      if (area !== "Home Analyst" && area !== "Office Analyst") return;

      const name = r.employee_name;
      if (!name) return;

      upsert(name, Number(r.total_hours ?? 0), 0);
    });

    (ttData ?? []).forEach((r) => {
      const home = r.home_allocated;
      const away = r.away_allocated;

      if (home) upsert(home, 0, 0.5);
      if (away) upsert(away, 0, 0.5);
    });

    return Array.from(map.values())
      .map((a) => ({
        name: a.name,
        hours: a.hours,
        games: a.games,
        avg: a.games > 0 ? a.hours / a.games : 0,
      }))
      .filter((a) => a.games > 0 && a.avg > 0);
  }, [deputyData, ttData]);

  const max = Math.max(...data.map((d) => d.avg), 1);

  const top10 = [...data].sort((a, b) => a.avg - b.avg).slice(0, 10);
  const bottom10 = [...data].sort((a, b) => b.avg - a.avg).slice(0, 10);

  const renderTable = (list: any[], tone: "good" | "bad", title: string) => {
    return (
      <div
        style={{
          background: THEME.panel,
          border: `1px solid ${THEME.border}`,
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: `1px solid ${THEME.border}`,
            background: THEME.panelSoft,
            fontWeight: 700,
            fontSize: 20,
            color: THEME.text,
          }}
        >
          {title}
        </div>

        {/* COLUMN HEADER */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 90px 90px 90px 140px",
            padding: "10px 14px",
            fontSize: 15,
            fontWeight: 700,
            color: THEME.muted,
            borderBottom: `1px solid ${THEME.border}`,

              alignItems: "center",
  justifyItems: "center", // ⬅️ centers horizontally
  textAlign: "center",    // ⬅️ ensures text centering
          }}
        >
          <div>#</div>
          <div>Analyst</div>
          <div>Avg</div>
          <div>Hours</div>
          <div>Games</div>
        </div>

        {list.map((d, i) => {
          const percent = Math.min((d.avg / max) * 100, 100);

          const color =
            tone === "good"
              ? i === 0
                ? THEME.success
                : THEME.accent
              : i === 0
              ? THEME.danger
              : THEME.warn;

          return (
            <div
              key={d.name}
style={{
  display: "grid",
  gridTemplateColumns: "60px 1fr 90px 90px 90px 140px",
  padding: "10px 14px",
  fontSize: 14,
  borderBottom: `1px solid ${THEME.border}`,
  alignItems: "center",
  justifyItems: "center", // ⬅️ horizontal centering
  textAlign: "center",
  background: i % 2 === 0 ? THEME.panel : THEME.panelSoft,
  color: THEME.text,
}}
            >
              {/* Rank */}
              <div style={{ fontWeight: 700, color: THEME.muted }}>
                {i + 1}
              </div>

              {/* Name */}
              <div style={{ fontWeight: 600 }}>{d.name}</div>

              {/* Avg */}
              <div style={{ fontWeight: 600 }}>
                {d.avg.toFixed(2)}
              </div>

              {/* Hours */}
              <div style={{ color: THEME.muted }}>
                {d.hours.toFixed(1)}
              </div>

              {/* Games */}
              <div style={{ color: THEME.muted }}>
                {d.games.toFixed(1)}
              </div>


            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      style={{
        marginTop: 20,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 28,
        background: THEME.bg,
        padding: 16,
        borderRadius: 16,
      }}
    >
      {renderTable(top10, "good", "🟢 Top 10 Most Efficient Analysts")}

      {renderTable(
        bottom10,
        "bad",
        "🔴 Bottom 10 Least Efficient Analysts"
      )}
    </div>
  );
}