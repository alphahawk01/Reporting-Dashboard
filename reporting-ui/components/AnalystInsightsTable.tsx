"use client";

import { useMemo, useState } from "react";

type AnalystRow = {
  name: string;
  games: number;
  totalShifts: number;
  totalHours: number;
  totalCost: number;
  avgHoursPerGame: number;
  aveShiftCost: number;
  costPerGame: number;
  costPerHour: number;
};

type SortKey = keyof AnalystRow;

export default function AnalystInsightsTable({
  data,
}: {
  data: AnalystRow[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("aveShiftCost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const formatMoney = (v: number) =>
    `$${Number(v || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const formatNum = (v: number) =>
    Number(v || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedData = useMemo(() => {
    const sorted = [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      const aNum = typeof aVal === "number" ? aVal : 0;
      const bNum = typeof bVal === "number" ? bVal : 0;

      if (sortKey === "name") {
        return sortDir === "asc"
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      }

      return sortDir === "asc" ? aNum - bNum : bNum - aNum;
    });

    return sorted;
  }, [data, sortKey, sortDir]);

  const Header = ({
    label,
    colKey,
    right = false,
  }: {
    label: string;
    colKey: SortKey;
    right?: boolean;
  }) => (
    <th
      onClick={() => handleSort(colKey)}
      style={{
        ...th,
        textAlign: right ? "right" : "left",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {label} {sortKey === colKey ? (sortDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );

  return (
    <div
      style={{
        background: "white",
        border: "1px solid #eee",
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
        📊 Analyst Insights
      </div>

      {/* SCROLL AREA (~10 rows) */}
      <div
        style={{
          maxHeight: 520,
          overflowY: "auto",
          border: "1px solid #eee",
          borderRadius: 10,
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{
                position: "sticky",
                top: 0,
                background: "white",
                zIndex: 2,
                borderBottom: "1px solid #eee",
                color: "#666",
              }}
            >
              <Header label="Name" colKey="name" />
              <Header label="Games" colKey="games" right />
              <Header label="Shifts" colKey="totalShifts" right />
              <Header label="Hours" colKey="totalHours" right />
              <Header label="Cost" colKey="totalCost" right />
              <Header label="Avg Hrs/Game" colKey="avgHoursPerGame" right />
              <Header label="Shift Cost" colKey="aveShiftCost" right />
              <Header label="Cost/Game" colKey="costPerGame" right />
              <Header label="Cost/Hr" colKey="costPerHour" right />
            </tr>
          </thead>

          <tbody>
            {sortedData.map((row, i) => (
              <tr
                key={row.name}
                style={{
                  borderBottom: "1px solid #f2f2f2",
                  background: i % 2 === 0 ? "#fff" : "#fafafa",
                }}
              >
                <td style={tdName}>{row.name}</td>
                <td style={tdRight}>{formatNum(row.games)}</td>
                <td style={tdRight}>{formatNum(row.totalShifts)}</td>
                <td style={tdRight}>{formatNum(row.totalHours)}</td>
                <td style={tdRight}>{formatMoney(row.totalCost)}</td>
                <td style={tdRight}>{formatNum(row.avgHoursPerGame)}</td>
                <td style={tdRight}>{formatMoney(row.aveShiftCost)}</td>
                <td style={tdRight}>{formatMoney(row.costPerGame)}</td>
                <td style={tdRight}>{formatMoney(row.costPerHour)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -------------------------
const th: React.CSSProperties = {
  padding: "10px 8px",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const tdName: React.CSSProperties = {
  padding: "10px 8px",
  fontWeight: 500,
};

const tdRight: React.CSSProperties = {
  padding: "10px 8px",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};