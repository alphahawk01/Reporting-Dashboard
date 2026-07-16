"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AnalystHero from "./AnalystHero";
import StrengthPanel from "./StrengthPanel";
import WeaknessPanel from "./WeaknessPanel";
import LeagueBreakdown from "./LeagueBreakdown";
import TeamBreakdown from "./TeamBreakdown";
import AverageCodingTimeTrend from "./AverageCodingTimeTrend";
import GamesCompletedTrend from "./GamesCompletedTrend";
import HoursPerWeekTrend from "./HoursPerWeekTrend";
import DashboardChartCard from "./DashboardChartCard";
import { buildAnalystBenchmark } from "@/lib/analytics/buildAnalystBenchmark";
import AttributeRatings from "./AttributeRatings";

import { supabase } from "@/lib/supabase";
import { buildAnalystMetrics } from "@/lib/analytics/buildAnalystMetrics";

export default function AnalystProfilePage() {
  const [selectedAnalyst, setSelectedAnalyst] = useState("All");
  const [analysts, setAnalysts] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const PAGE_SIZE = 1000;

  // -------------------------
  // FETCH ALL ROWS
  // -------------------------
  async function fetchAll(table: string) {
    let from = 0;
    let all: any[] = [];

    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error(`Error fetching ${table}:`, error);
        break;
      }

      if (!data || data.length === 0) break;

      all = all.concat(data);

      if (data.length < PAGE_SIZE) break;

      from += PAGE_SIZE;
    }

    return all;
  }

  // -------------------------
  // LOAD DATA
  // -------------------------
  useEffect(() => {
    async function load() {
      setLoading(true);

      const shiftsData = await fetchAll("deputy_shifts");
      const gamesData = await fetchAll("TT_Games");

      setShifts(shiftsData);
      setGames(gamesData);

      const analystData =
        buildAnalystBenchmark(
          buildAnalystMetrics(
            shiftsData,
            gamesData
          )
        );
      setAnalysts(analystData);

      setLoading(false);
    }

    load();
  }, []);

  // -------------------------
  // DROPDOWN LIST
  // -------------------------
  const analystList = useMemo(() => {
    return [
      "All",
      ...analysts
        .map((a) => a.name)
        .sort((a, b) => a.localeCompare(b)),
    ];
  }, [analysts]);

  // -------------------------
  // ACTIVE ANALYST
  // -------------------------
  const activeData = useMemo(() => {

    if (!analysts.length) return null;

    if (selectedAnalyst === "All") return analysts[0];

    return (
      analysts.find((a) => a.name === selectedAnalyst) ||
      analysts[0]
    );
  }, [selectedAnalyst, analysts]);

  console.log("ACTIVE ANALYST", activeData);

  // -------------------------
  // FILTERING (CRITICAL FIX)
  // -------------------------
  const filteredShifts = useMemo(() => {
    if (selectedAnalyst === "All") return shifts;

    return shifts.filter((s) => {
      const name =
        s.analyst || s.name || s.Analyst || s.employee_name;

      return name === selectedAnalyst;
    });
  }, [shifts, selectedAnalyst]);

  const filteredGames = useMemo(() => {
    if (selectedAnalyst === "All") return games;

    return games.filter((g) => {
      const name =
        g.analyst || g.name || g.Analyst || g.employee_name;

      return name === selectedAnalyst;
    });
  }, [games, selectedAnalyst]);

  // -------------------------
  // LOADING STATE
  // -------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-white p-10">
        Loading analysts...
      </div>
    );
  }

  // -------------------------
  // MAIN RENDER
  // -------------------------
  return (
    <div className="min-h-screen bg-[#0b1220] p-6 text-slate-200">

      {/* TOP FILTER */}
      <div className="max-w-7xl mx-auto mb-6 flex items-center justify-between">
        {/* BACK TO DASHBOARD */}
        <Link
          href="/"
          className="
      inline-flex
      items-center
      gap-2
      rounded-lg
      border
      border-slate-700
      bg-[#0f1b2d]
      px-4
      py-2
      text-sm
      font-medium
      text-slate-200
      transition
      hover:border-sky-500/50
      hover:bg-slate-800
      hover:text-white
    "
        >
          <span aria-hidden="true">←</span>
          Back to Dashboard
        </Link>

        {/* ANALYST FILTER */}
        <select
          value={selectedAnalyst}
          onChange={(e) => setSelectedAnalyst(e.target.value)}
          className="
      rounded-lg
      border
      border-slate-700
      bg-[#0f1b2d]
      px-3
      py-2
      text-sm
      text-slate-200
      focus:outline-none
      focus:ring-1
      focus:ring-sky-400
    "
        >
          {analystList.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* CONTENT */}
      <div className="max-w-7xl mx-auto space-y-6">

        {activeData ? (
          <>
            <div className="relative z-20">
              <AnalystHero data={activeData} />
            </div>

            <div className="relative z-10">
              <AttributeRatings ratings={activeData.ratings} />
            </div>

            {/* TOP METRICS ROW (ALL IN ONE LINE) */}
            <div className="grid grid-cols-3 gap-6 items-stretch">

              <DashboardChartCard title="Ave Weekly Coding Speed">
                <div className="h-[260px]">
                  <AverageCodingTimeTrend
                    deputyData={shifts}
                    ttData={games}
                    analystName={selectedAnalyst}
                  />
                </div>
              </DashboardChartCard>

              <DashboardChartCard title="Games Completed Per Week">
                <div className="h-[260px]">
                  <GamesCompletedTrend
                    data={games}
                    analystName={selectedAnalyst}
                  />
                </div>
              </DashboardChartCard>

              <DashboardChartCard title="Hours Per Week">
                <HoursPerWeekTrend
                  deputyData={filteredShifts}
                />
              </DashboardChartCard>

            </div>

            {/* LEAGUE + TEAM */}
            <div className="grid grid-cols-2 gap-6 items-stretch">
              <div className="h-full">
                <LeagueBreakdown data={activeData.competitions} />
              </div>

              <div className="h-full">
                <TeamBreakdown data={activeData.teams} />
              </div>
            </div>

            {/* FINAL ROW */}
            <div className="grid grid-cols-2 gap-6 items-stretch">
              <div className="h-full">
                <WeaknessPanel data={activeData} />
              </div>

              <div className="h-full">
                <StrengthPanel data={activeData} />
              </div>
            </div>

          </>
        ) : (
          <div className="text-slate-400">
            No analyst data available
          </div>
        )}
      </div>
    </div>
  );
}