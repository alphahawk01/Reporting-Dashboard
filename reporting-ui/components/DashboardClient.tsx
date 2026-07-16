"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { calculateKPIs } from "@/lib/analytics";

import HoursByEmployee from "./HoursByEmployee";
import CostByArea from "./CostByArea";
import CostByAreaByWeek from "./CostByAreaByWeek";
import TTGames from "./TTGames";
import AveHoursPerGame from "./AveHoursPerGame";
import AveHoursTopAnalysts from "./AveHoursTopAnalysts";
import AnalystInsightsTable from "./AnalystInsightsTable";
import BonusTracker from "./BonusTracker";
import AnalystHeaderCard from "@/app/analyst-profile/AnalystHeaderCard";

import {
  buildAnalystMetrics,
} from "@/lib/analytics/buildAnalystMetrics";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/UI/tabs";
import DashboardLayout from "./DashboardLayout";
import Header from "./Header";

// -------------------------
// NORMALISATION
// -------------------------
const normalize = (v: any) =>
  String(v ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
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
// MAIN COMPONENT
// -------------------------
export default function DashboardClient({
  deputyData,
  ttData,
}: {
  deputyData: any[];
  ttData: any[];
}) {
  // -------------------------
  // STATE
  // -------------------------
  const [employee, setEmployee] = useState("all");
  const [area, setArea] = useState("all");
  const [week, setWeek] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [ttWeek, setTtWeek] = useState("all");
  const [ttAnalyst, setTtAnalyst] = useState("all");

  // -------------------------
  // FILTER DEPUTY DATA
  // -------------------------
  const filtered = useMemo(() => {
    const safe = deputyData ?? [];

    return safe.filter((r) => {
      const shiftDate = r.shift_date ? new Date(r.shift_date) : null;
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      return (
        (employee === "all" || normalize(r.employee_name) === normalize(employee)) &&
        (area === "all" || normalize(r.area_name) === normalize(area)) &&
        (week === "all" || normalize(r.week) === normalize(week)) &&
        (!start || (shiftDate && shiftDate >= start)) &&
        (!end || (shiftDate && shiftDate <= end))
      );
    });
  }, [deputyData, employee, area, week, startDate, endDate]);

  // -------------------------
  // FILTER TT DATA
  // -------------------------
  const filteredTT = useMemo(() => {
    const selected = normalize(ttAnalyst);

    return (ttData ?? []).filter((r) => {
      const rowWeek = String(r.week ?? "").trim();
      const home = normalize(r.home_allocated);
      const away = normalize(r.away_allocated);

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
  // ANALYST METRICS
  // -------------------------
const analystMetrics = useMemo(() => {
  return buildAnalystMetrics(filtered, filteredTT);
}, [filtered, filteredTT]);
  
  // -------------------------
  // SELECTED ANALYST
  // -------------------------
  const selectedAnalyst = useMemo(() => {
    if (employee === "all") return null;

    return (
      analystMetrics.find(
        (a) => a.name?.toLowerCase() === employee?.toLowerCase()
      ) || null
    );
  }, [analystMetrics, employee]);

  // -------------------------
  // DEBUG
  // -------------------------
useEffect(() => {
  console.log("🔥 DASHBOARD UPDATED");

  console.log("📊 RAW deputyData:", deputyData?.length);
  console.log("📊 RAW ttData:", ttData?.length);

  console.log("📊 FILTERED:", filtered?.length);
  console.log("📊 FILTERED TT:", filteredTT?.length);

  console.log("📊 METRICS:", analystMetrics?.length);
  console.log("📊 FIRST ANALYST:", analystMetrics?.[0]);
}, [
  deputyData,
  ttData,
  filtered,
  filteredTT,
  analystMetrics
]);
if (!analystMetrics?.length) {
  console.log("❌ No analyst metrics generated");
  return null;
}
console.log("👤 SELECTED EMPLOYEE:", employee);
console.log("👤 SELECTED ANALYST:", selectedAnalyst?.name);
  // -------------------------
  // RENDER
  // -------------------------
  return (
    <DashboardLayout>
      <main style={{ minHeight: "100vh", padding: 32, background: "#F4F7FB" }}>
<Header />

<div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  }}
>
  <h1
    style={{
      fontSize: 28,
      fontWeight: 700,
      margin: 0,
    }}
  >
    📊 Reporting Dashboard
  </h1>

  <Link
    href="/analyst-profile"
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px 18px",
      borderRadius: 10,
      background: "#0F172A",
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: 600,
      textDecoration: "none",
      cursor: "pointer",
    }}
  >
    View Analyst Profiles →
  </Link>
</div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tt">TT Games</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="bonus">Bonus</TabsTrigger>
          </TabsList>
{/* OVERVIEW */}
<TabsContent value="overview">
  {/* KPI CARDS */}
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

  {/* MAIN CHARTS */}
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 20,
      marginTop: 20,
    }}
  >
    <HoursByEmployee data={filtered} />
    <CostByArea data={deputyData} />
  </div>


  {/* WEEKLY COST TABLE */}
  <div style={{ marginTop: 20 }}>
    <CostByAreaByWeek data={filtered} />
  </div>
</TabsContent>

{/* TT GAMES */}
<TabsContent value="tt">
  <div style={{ marginTop: 20 }}>
    <TTGames data={filteredTT} />
  </div>
</TabsContent>

          {/* PERFORMANCE */}
          <TabsContent value="performance">
            <AveHoursTopAnalysts deputyData={deputyData} ttData={ttData} />

            <AnalystInsightsTable analysts={analystMetrics} />

            <AveHoursPerGame
              deputyData={deputyData}
              ttData={ttData}
            />
          </TabsContent>

        </Tabs>

        {selectedAnalyst && (
          <div style={{ marginTop: 20 }}>
            <AnalystHeaderCard data={selectedAnalyst} />
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}

// -------------------------
// CARD
// -------------------------
function Card({ title, value }: any) {
  return (
    <div style={{ padding: 20, borderRadius: 16, background: "#fff" }}>
      <div style={{ fontSize: 12 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
    </div>
  );
}