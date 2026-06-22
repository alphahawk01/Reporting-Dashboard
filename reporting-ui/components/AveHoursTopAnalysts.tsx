"use client";

import { useMemo } from "react";

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
  // -------------------------
  // BUILD BASE DATA
  // -------------------------
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

    // -------------------------
    // DEPUTY HOURS
    // -------------------------
    (deputyData ?? []).forEach((r) => {
      const area = String(r.area_name ?? "").trim();

      if (area !== "Home Analyst" && area !== "Office Analyst") return;

      const name = r.employee_name;
      if (!name) return;

      upsert(name, Number(r.total_hours ?? 0), 0);
    });

    // -------------------------
    // TT GAMES
    // -------------------------
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

  // -------------------------
  // SORTED VIEWS
  // -------------------------
  const top10 = [...data]
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 10);

  const bottom10 = [...data]
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);

  // -------------------------
  // RENDER ROWS
  // -------------------------
  const renderList = (list: any[], tone: "good" | "bad") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {list.map((d, i) => {
        const percent = Math.min((d.avg / max) * 100, 100);

        const color =
          tone === "good"
            ? i === 0
              ? "#22c55e"
              : "#3b82f6"
            : i === 0
            ? "#ef4444"
            : "#f97316";

        return (
          <div
            key={d.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 10,
              background: "#fafafa",
              border: "1px solid #f0f0f0",
            }}
          >
            {/* Rank */}
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                background: color,
                color: "white",
              }}
            >
              {i + 1}
            </div>

            {/* Name */}
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
              {d.name}
            </div>

            {/* Value */}
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              {d.avg.toFixed(2)}
            </div>

            {/* Bar */}
            <div
              style={{
                width: 120,
                height: 6,
                background: "#eee",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${percent}%`,
                  height: "100%",
                  background: color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  // -------------------------
  // UI
  // -------------------------
  return (
    <div
      style={{
        marginTop: 20,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
      }}
    >
      {/* TOP 10 */}
      <div
        style={{
          padding: 16,
          background: "white",
          border: "1px solid #eee",
          borderRadius: 12,
        }}
      >
        <h3 style={{ margin: 0, marginBottom: 12 }}>
          🟢 Top 10 Most Efficient
        </h3>
        {renderList(top10, "good")}
      </div>

      {/* BOTTOM 10 */}
      <div
        style={{
          padding: 16,
          background: "white",
          border: "1px solid #eee",
          borderRadius: 12,
        }}
      >
        <h3 style={{ margin: 0, marginBottom: 12 }}>
          🔴 Bottom 10 Least Efficient
        </h3>
        {renderList(bottom10, "bad")}
      </div>
    </div>
  );
}