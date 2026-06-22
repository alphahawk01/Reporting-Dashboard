"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateKPIs } from "@/lib/analytics";


import HoursByEmployee from "./HoursByEmployee";
import CostByArea from "./CostByArea";
import CostByAreaByWeek from "./CostByAreaByWeek";
import TTGames from "./TTGames";
import AveHoursPerGame from "./AveHoursPerGame";
import AveHoursTopAnalysts from "./AveHoursTopAnalysts";
import AnalystInsightsTable from "./AnalystInsightsTable";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/UI/tabs";
import DashboardLayout from "./DashboardLayout";
import Header from "./Header";

// -------------------------
const normalize = (v: any) =>
  String(v ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const formatNumber = (v: any) =>
  Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatCurrency = (v: any) =>
  `$${Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// -------------------------
export default function DashboardClient({
  deputyData,
  ttData,
}: {
  deputyData: any[];
  ttData: any[];
}) {

  const [employee, setEmployee] = useState("all");
  const [area, setArea] = useState("all");
  const [week, setWeek] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [ttWeek, setTtWeek] = useState("all");
  const [ttAnalyst, setTtAnalyst] = useState("all");
  const selectedEmployee = normalize(employee);
  const selectedArea = normalize(area);
  const selectedWeek = normalize(week);


  // -------------------------
  // FILTER DEPUTY
  // -------------------------
  const filtered = useMemo(() => {
    const safe = deputyData ?? [];

    return safe.filter((r) => {
      const shiftDate = r.shift_date ? new Date(r.shift_date) : null;
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      return (
        (employee === "all" || normalize(r.employee_name) === selectedEmployee) &&
        (area === "all" || normalize(r.area_name) === selectedArea) &&
        (week === "all" || normalize(r.week) === selectedWeek) &&
        (!start || (shiftDate && shiftDate >= start)) &&
        (!end || (shiftDate && shiftDate <= end))
      );
    });
  }, [deputyData, employee, area, week, startDate, endDate]);

  // -------------------------
  // FILTER TT
  // -------------------------
  const filteredTT = useMemo(() => {
    return (ttData ?? []).filter((r) => {
      const rowWeek = String(r.week ?? "").trim();
      const home = String(r.home_allocated ?? "").trim().toLowerCase();
      const away = String(r.away_allocated ?? "").trim().toLowerCase();
      const selected = ttAnalyst.trim().toLowerCase();

      return (
        (ttWeek === "all" || rowWeek === ttWeek) &&
        (ttAnalyst === "all" || home === selected || away === selected)
      );
    });
  }, [ttData, ttWeek, ttAnalyst]);

  // -------------------------
  // KPI
  // -------------------------
  const kpis = useMemo(() => calculateKPIs(filtered), [filtered]);

  // -------------------------
  // ANALYST INSIGHTS (FIXED)
  // -------------------------
  const analystInsightsData = useMemo(() => {
    const map = new Map<string, any>();

    const upsert = (name: string) => {
      const key = normalize(name);

      if (!map.has(key)) {
        map.set(key, {
          name,
          games: 0,
          totalHours: 0,
          totalCost: 0,
          shiftCount: 0,
        });
      }

      return map.get(key);
    };

    // -------------------------
    // DEPUTY SHIFTS (COUNT ROWS)
    // -------------------------
    (filtered ?? []).forEach((r) => {
      if (!r.employee_name) return;

      const e = upsert(r.employee_name);

      e.totalHours += Number(r.total_hours || 0);
      e.totalCost += Number(r.total_cost || 0);

      // each row = 1 shift
      e.shiftCount += 1;
    });

    // -------------------------
    // TT GAMES
    // -------------------------
    (filteredTT ?? []).forEach((r) => {
      if (r.home_allocated) upsert(r.home_allocated).games += 0.5;
      if (r.away_allocated) upsert(r.away_allocated).games += 0.5;
    });

    return Array.from(map.values())
      .map((a) => {
        const avgHoursPerGame = a.games ? a.totalHours / a.games : 0;

        const aveShiftCost = a.shiftCount
          ? a.totalCost / a.shiftCount
          : 0;

        const costPerGame = a.games
          ? a.totalCost / a.games
          : 0;

        const costPerHour = a.totalHours
          ? a.totalCost / a.totalHours
          : 0;

        return {
          name: a.name,

          games: a.games,

          // ✅ NEW COLUMN (EXPLICIT)
          totalShifts: a.shiftCount,

          totalHours: a.totalHours,
          totalCost: a.totalCost,

          avgHoursPerGame,
          aveShiftCost,
          costPerGame,
          costPerHour,
        };
      })
      .filter((a) => a.totalShifts > 0)
      .sort((a, b) => b.aveShiftCost - a.aveShiftCost);
  }, [filtered, filteredTT]);

  return (
    <DashboardLayout>
      <main
        style={{
          minHeight: "100vh",
          padding: 32,
background: "#F4F7FB",
color: "#0A2540",
        }}
      >
        <Header />

        {/* TITLE */}
<h1
  style={{
    fontSize: 28,
    fontWeight: 700,
    marginTop: 10,
    color: "#0A2540",
    letterSpacing: "-0.02em",
  }}
>
            📊 Reporting Dashboard
        </h1>

        <p style={{ color: "#64748B", marginTop: 4 }}>
          Workforce & performance analytics
        </p>

        {/* FILTERS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16,
            margin: "24px 0",
            padding: 20,
            background: "white",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          {/* Employee */}
          <div>
            <label>Employee</label>
            <select
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            >
              <option value="all">All Employees</option>
              {[...new Set(deputyData.map(r => r.employee_name).filter(Boolean))]
                .sort()
                .map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </div>

          {/* Area */}
          <div>
            <label>Area</label>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            >
              <option value="all">All Areas</option>
              {[...new Set(deputyData.map(r => r.area_name).filter(Boolean))]
                .sort()
                .map(area => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
            </select>
          </div>

          {/* Week */}
          <div>
            <label>Week</label>
            <select
              value={week}
              onChange={(e) => setWeek(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            >
              <option value="all">All Weeks</option>
              {[...new Set(deputyData.map(r => r.week).filter(Boolean))]
                .sort((a, b) => Number(a) - Number(b))
                .map(week => (
                  <option key={week} value={week}>
                    {week}
                  </option>
                ))}
            </select>
          </div>

          {/* Dates */}
          <div>
            <label>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
          </div>

          <div>
            <label>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
          </div>

          {/* Reset */}
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={() => {
                setEmployee("all");
                setArea("all");
                setWeek("all");
                setStartDate("");
                setEndDate("");
              }}
              style={{
                width: "100%",
                padding: 10,
                background: "#6366f1",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* TABS */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tt">TT Games</TabsTrigger>
            <TabsTrigger value="performance">Analyst Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 15,
              }}
            >
              <Card title="Total Hours" value={formatNumber(kpis.totalHours)} />
              <Card title="Total Cost" value={formatCurrency(kpis.totalCost)} />
              <Card title="Employees" value={kpis.employeeCount} />
              <Card title="Shifts" value={kpis.shiftCount} />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 20,
                marginTop: 20,
              }}
            >
              <HoursByEmployee data={filtered} />
              <CostByArea data={filtered} />
            </div>
            <div style={{ marginTop: 20 }}>
  <CostByAreaByWeek data={filtered} />
</div>
          </TabsContent>

          <TabsContent value="tt">
            <TTGames data={filteredTT} />
          </TabsContent>

          <TabsContent value="performance">
            <AveHoursTopAnalysts deputyData={deputyData} ttData={ttData} />

            <AnalystInsightsTable data={analystInsightsData} />

            <div style={{ marginTop: 20 }}>
              <AveHoursPerGame deputyData={deputyData} ttData={ttData} />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </DashboardLayout>
  );
}

function Card({ title, value }: any) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 16,
        background: "#ffffff",
        border: "1px solid #E6EEF5",
        boxShadow: "0 6px 20px rgba(11,46,79,0.06)",
        transition: "all 0.2s ease",
      }}
    >
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>
        {title}
      </div>

      <div style={{ fontSize: 26, fontWeight: 700, color: "#0A2540" }}>
        {value}
      </div>

      {/* subtle accent line */}
      <div
        style={{
          marginTop: 10,
          height: 3,
          width: 40,
          background: "#14B8A6",
          borderRadius: 2,
        }}
      />
    </div>
  );
}