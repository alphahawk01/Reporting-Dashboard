"use client";

import { useMemo, useState } from "react";
import { AnalystMetrics } from "@/lib/analytics/buildAnalystMetrics";

// -------------------------
// TABLE THEME
// -------------------------
const THEME = {
  panel: "#0b1220",
  panelSoft: "#111f35",

  headerBg: "#0f1b2d",
  headerText: "#cbd5e1",

  tableBg: "#ffffff",
  rowAlt: "#f8fafc",
  rowHover: "#eff6ff",

  text: "#0f172a",
  muted: "#64748b",

  border: "#e2e8f0",

  accent: "#38bdf8",
  success: "#16a34a",
  warn: "#d97706",
  danger: "#dc2626",
};

// -------------------------
// COMPONENT
// -------------------------
export default function AnalystInsightsTable({
  analysts,
}: {
  analysts: AnalystMetrics[];
}) {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof AnalystMetrics;
    direction: "asc" | "desc";
  }>({
    key: "name",
    direction: "asc",
  });

  // -------------------------
  // TABLE DATA
  // -------------------------
  const table = analysts ?? [];

  // -------------------------
  // SORT
  // -------------------------
  const sortedTable = useMemo(() => {
    return [...table].sort((a, b) => {
      const { key, direction } = sortConfig;

      const aVal = a[key];
      const bVal = b[key];

      if (typeof aVal === "string") {
        const result = aVal.localeCompare(bVal as string);
        return direction === "asc" ? result : -result;
      }

      const result = Number(aVal) - Number(bVal);
      return direction === "asc" ? result : -result;
    });
  }, [table, sortConfig]);

  const requestSort = (key: keyof AnalystMetrics) => {
    setSortConfig((previous) => ({
      key,
      direction:
        previous.key === key && previous.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  // -------------------------
  // FORMATTERS
  // -------------------------
  const money = (value: number) =>
    `$${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const num = (value: number) =>
    Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // -------------------------
  // SORT INDICATOR
  // -------------------------
  const SortIndicator = ({
    field,
  }: {
    field: keyof AnalystMetrics;
  }) => {
    if (sortConfig.key !== field) {
      return (
        <span
          style={{
            marginLeft: 6,
            color: "#64748b",
            opacity: 0.5,
          }}
        >
          ↕
        </span>
      );
    }

    return (
      <span
        style={{
          marginLeft: 6,
          color: THEME.accent,
        }}
      >
        {sortConfig.direction === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  // -------------------------
  // HEADER CELL
  // -------------------------
  const Header = ({
    label,
    field,
    width,
  }: {
    label: string;
    field: keyof AnalystMetrics;
    width: string;
  }) => (
    <th
      onClick={() => requestSort(field)}
      style={{
        width,
        padding: "12px 8px",
        cursor: "pointer",
        textAlign: "center",
        verticalAlign: "middle",

        position: "sticky",
        top: 0,
        zIndex: 2,

        background: THEME.headerBg,
        color: THEME.headerText,

        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.04em",

        borderBottom: "1px solid #243247",
        whiteSpace: "nowrap",

        userSelect: "none",
      }}
    >
      {label}
      <SortIndicator field={field} />
    </th>
  );

  // -------------------------
  // STANDARD CELL STYLE
  // -------------------------
  const cellStyle = {
    padding: "11px 8px",
    textAlign: "center" as const,
    verticalAlign: "middle" as const,
    color: THEME.text,
    fontSize: 13,
    fontWeight: 500,
    borderBottom: `1px solid ${THEME.border}`,
    whiteSpace: "nowrap" as const,
  };

  // -------------------------
  // RENDER
  // -------------------------
  return (
    <div
      style={{
        background: THEME.tableBg,
        borderRadius: 18,
        border: `1px solid ${THEME.border}`,
        overflow: "hidden",
        boxShadow: "0 12px 35px rgba(15,23,42,0.10)",
      }}
    >
      {/* TITLE HEADER */}
      <div
        style={{
          padding: "20px 22px",
          background: `linear-gradient(
            135deg,
            ${THEME.panel},
            ${THEME.panelSoft}
          )`,
          borderBottom: "1px solid #243247",
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#ffffff",
          }}
        >
          Analyst Coding Performance
        </div>

        <div
          style={{
            fontSize: 13,
            color: "#94a3b8",
            marginTop: 4,
          }}
        >
          Efficiency view across cost, hours and games completed
        </div>
      </div>

      {/* TABLE */}
      <div
        style={{
          maxHeight: 650,
          overflowY: "auto",
          background: THEME.tableBg,
        }}
      >
        <table
          style={{
            width: "100%",
            tableLayout: "fixed",
            borderCollapse: "separate",
            borderSpacing: 0,
          }}
        >
          <thead>
            <tr>
              {/* NAME */}
              <th
                onClick={() => requestSort("name")}
                style={{
                  width: "18%",
                  padding: "12px 14px",
                  cursor: "pointer",
                  textAlign: "left",
                  verticalAlign: "middle",

                  position: "sticky",
                  top: 0,
                  zIndex: 2,

                  background: THEME.headerBg,
                  color: THEME.headerText,

                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",

                  borderBottom: "1px solid #243247",
                  whiteSpace: "nowrap",

                  userSelect: "none",
                }}
              >
                Name
                <SortIndicator field="name" />
              </th>

              <Header
                label="Games Completed"
                field="totalGames"
                width="12%"
              />

              <Header
                label="Total Hours"
                field="totalHours"
                width="11%"
              />

              <Header
                label="Total Cost"
                field="totalCost"
                width="12%"
              />

              <Header
                label="Cost / Game"
                field="avgCostPerGame"
                width="13%"
              />

              <Header
                label="Avg Hrs / Game"
                field="avgHoursPerGame"
                width="13%"
              />

              <Header
                label="Cost / Hour"
                field="costPerHour"
                width="11%"
              />
            </tr>
          </thead>

          <tbody>
            {sortedTable.map((r, index) => (
              <tr
                key={r.key}
                style={{
                  background:
                    index % 2 === 0
                      ? THEME.tableBg
                      : THEME.rowAlt,
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = THEME.rowHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    index % 2 === 0
                      ? THEME.tableBg
                      : THEME.rowAlt;
                }}
              >
                {/* NAME */}
                <td
                  style={{
                    ...cellStyle,
                    padding: "11px 14px",
                    textAlign: "left",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  {r.name}
                </td>

                {/* GAMES COMPLETED */}
                <td style={cellStyle}>
                  {r.totalGames.toFixed(1)}
                </td>

                {/* TOTAL HOURS */}
                <td style={cellStyle}>
                  {num(r.totalHours)}
                </td>

                {/* TOTAL COST */}
                <td style={cellStyle}>
                  {money(r.totalCost)}
                </td>

                {/* COST PER GAME */}
                <td
                  style={{
                    ...cellStyle,
                    fontWeight: 600,
                  }}
                >
                  {money(r.avgCostPerGame)}
                </td>

                {/* AVG HOURS PER GAME */}
                <td
                  style={{
                    ...cellStyle,
                    fontWeight: 600,
                  }}
                >
                  {r.avgHoursPerGame.toFixed(2)}
                </td>

                {/* COST PER HOUR */}
                <td
                  style={{
                    ...cellStyle,
                    fontWeight: 700,
                    color:
                      r.costPerHour < 60
                        ? THEME.success
                        : r.costPerHour < 90
                          ? THEME.warn
                          : THEME.danger,
                  }}
                >
                  {money(r.costPerHour)}
                </td>
              </tr>
            ))}

            {sortedTable.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: THEME.muted,
                    fontSize: 14,
                  }}
                >
                  No analyst data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}