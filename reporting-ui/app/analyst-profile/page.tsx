"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

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
import type { DeputyShift } from "@/types/deputy";
import type { TTGame } from "@/types/ttgame";
import { supabase } from "@/lib/supabase";
import { buildAnalystMetrics } from "@/lib/analytics/buildAnalystMetrics";
import type { AnalystMetrics } from "@/types/analyst";

export default function AnalystProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0b1220] text-white p-10">Loading...</div>}>
      <AnalystProfileContent />
    </Suspense>
  );
}

function AnalystProfileContent() {
  const searchParams = useSearchParams();
  const analystParam = searchParams.get("analyst");
  const [selectedAnalyst, setSelectedAnalyst] = useState(analystParam ?? "All");
  const [analysts, setAnalysts] = useState<AnalystMetrics[]>([]);
  const [shifts, setShifts] = useState<DeputyShift[]>([]);
  const [games, setGames] = useState<TTGame[]>([]);
  const [teamLogoMap, setTeamLogoMap] = useState<Record<string, string>>({});
  const [affiliations, setAffiliations] =
    useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [gameSortField, setGameSortField] = useState("Week");
  const [gameSortDir, setGameSortDir] = useState<"asc" | "desc">("desc");

  const PAGE_SIZE = 1000;

  // -------------------------
  // FETCH ALL ROWS
  // -------------------------
async function fetchAll<T>(table: string): Promise<T[]> {
  let from = 0;
  let all: T[] = [];

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

    all = all.concat(data as T[]);

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

const shiftsData = await fetchAll<DeputyShift>("deputy_shifts");
const gamesData = await fetchAll<TTGame>("TT_Games");

      // Fetch team logos from Supabase
      try {
        const { data: teamsData, error: teamsError } = await supabase
          .from("teams")
          .select("team_name, logo_url");

        if (!teamsError && teamsData) {
          const logoMap: Record<string, string> = {};
          for (const row of teamsData) {
            if (row.team_name && row.logo_url) {
              logoMap[row.team_name.trim().toLowerCase()] = row.logo_url;
            }
          }
          setTeamLogoMap(logoMap);
        }
      } catch {
        // Fall back to static clubLogos mapping
      }

      // Fetch analyst → team affiliations
      try {
        const { data: affiliationData, error: affiliationError } =
          await supabase
            .from("analyst_team_affiliations")
            .select("analyst_name, teams ( team_name )");

        if (!affiliationError && affiliationData) {
          const map = new Map<string, string[]>();

          for (const row of affiliationData as any[]) {
            const name = row.analyst_name?.trim().toLowerCase();
            const team = row.teams?.team_name?.trim();

            if (!name || !team) continue;

            const existing = map.get(name) ?? [];
            if (!existing.includes(team)) existing.push(team);
            map.set(name, existing);
          }

          setAffiliations(map);
        }
      } catch {
        // Affiliations are supplementary — fail quietly
      }

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

  return shifts.filter(
    (shift) => shift.employee_name === selectedAnalyst
  );
}, [shifts, selectedAnalyst]);

const filteredGames = useMemo(() => {
  if (selectedAnalyst === "All") return games;

  return games.filter(
    (game) =>
      game.home_allocated === selectedAnalyst ||
      game.away_allocated === selectedAnalyst
  );
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

        <Link
          href="/analyst-compare"
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
    "
        >
          Compare Analysts
        </Link>

        {/* ANALYST FILTER */}
        <select
          value={selectedAnalyst}
          onChange={(e) => setSelectedAnalyst(e.target.value)}
          className="
    relative
    z-[9999]
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
              <AnalystHero
                data={activeData}
                affiliatedTeams={
                  affiliations.get(
                    activeData.name.trim().toLowerCase()
                  ) ?? []
                }
                logoMap={teamLogoMap}
              />
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
                <TeamBreakdown data={activeData.teams} logoMap={teamLogoMap} />
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

            {/* CODED GAMES */}
            {filteredGames.length > 0 && (() => {
              const [gameSort, setGameSort] = [gameSortField, setGameSortField];
              const [gameDir, setGameDir] = [gameSortDir, setGameSortDir];

              const sortedGames = [...filteredGames].sort((a, b) => {
                const dir = gameDir === "asc" ? 1 : -1;
                switch (gameSort) {
                  case "Week": return (Number(a.Week) - Number(b.Week)) * dir;
                  case "Competition": return (a.Competition ?? "").localeCompare(b.Competition ?? "") * dir;
                  case "Round": return (Number(a.Round) - Number(b.Round)) * dir;
                  case "home_team": return (a.home_team ?? "").localeCompare(b.home_team ?? "") * dir;
                  case "away_team": return (a.away_team ?? "").localeCompare(b.away_team ?? "") * dir;
                  case "role": {
                    const name = activeData?.name ?? selectedAnalyst;
                    const roleA = a.home_allocated === name && a.away_allocated === name ? "Both" : a.home_allocated === name ? "Home" : "Away";
                    const roleB = b.home_allocated === name && b.away_allocated === name ? "Both" : b.home_allocated === name ? "Home" : "Away";
                    return roleA.localeCompare(roleB) * dir;
                  }
                  default: return 0;
                }
              });

              const handleGameSort = (field: string) => {
                if (gameSort === field) {
                  setGameDir(gameDir === "asc" ? "desc" : "asc");
                } else {
                  setGameSortField(field);
                  setGameDir("asc");
                }
              };

              const SortIcon = ({ field }: { field: string }) => {
                if (gameSort !== field) return null;
                return <span>{gameDir === "asc" ? " ▲" : " ▼"}</span>;
              };

              return (
                <div className="rounded-xl border border-slate-700 bg-[#0f1b2d] p-5">
                  <h3 className="mb-4 text-lg font-bold text-white">
                    Games Coded ({filteredGames.length})
                  </h3>

                  <div className="overflow-hidden rounded-lg border border-slate-700">
                    <table className="w-full table-fixed text-left text-xs">
                      <colgroup>
                        <col className="w-[8%]" />
                        <col className="w-[25%]" />
                        <col className="w-[8%]" />
                        <col className="w-[22%]" />
                        <col className="w-[22%]" />
                        <col className="w-[15%]" />
                      </colgroup>
                      <thead className="bg-slate-800 text-slate-400 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleGameSort("Week")}>
                            Wk<SortIcon field="Week" />
                          </th>
                          <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleGameSort("Competition")}>
                            Competition<SortIcon field="Competition" />
                          </th>
                          <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleGameSort("Round")}>
                            Rnd<SortIcon field="Round" />
                          </th>
                          <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleGameSort("home_team")}>
                            Home<SortIcon field="home_team" />
                          </th>
                          <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleGameSort("away_team")}>
                            Away<SortIcon field="away_team" />
                          </th>
                          <th className="px-3 py-2 cursor-pointer hover:text-white" onClick={() => handleGameSort("role")}>
                            Role<SortIcon field="role" />
                          </th>
                        </tr>
                      </thead>
                    </table>
                    <div className="max-h-[400px] overflow-y-auto">
                      <table className="w-full table-fixed text-left text-xs">
                        <colgroup>
                          <col className="w-[8%]" />
                          <col className="w-[25%]" />
                          <col className="w-[8%]" />
                          <col className="w-[22%]" />
                          <col className="w-[22%]" />
                          <col className="w-[15%]" />
                        </colgroup>
                        <tbody>
                          {sortedGames.map((game, i) => {
                            const name = activeData?.name ?? selectedAnalyst;
                            const isHome = game.home_allocated === name;
                            const isAway = game.away_allocated === name;
                            const role = isHome && isAway ? "Both" : isHome ? "Home" : "Away";

                            return (
                              <tr
                                key={`${game.game_key}-${i}`}
                                className="border-t border-slate-700 hover:bg-slate-800"
                              >
                                <td className="px-3 py-2 text-sky-400 font-semibold">{game.Week}</td>
                                <td className="px-3 py-2 truncate text-slate-400">{game.Competition}</td>
                                <td className="px-3 py-2 text-slate-400">{game.Round}</td>
                                <td className="px-3 py-2 truncate">{game.home_team}</td>
                                <td className="px-3 py-2 truncate">{game.away_team}</td>
                                <td className="px-3 py-2">
                                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                    role === "Both"
                                      ? "bg-emerald-500/20 text-emerald-300"
                                      : role === "Home"
                                        ? "bg-sky-500/20 text-sky-300"
                                        : "bg-amber-500/20 text-amber-300"
                                  }`}>
                                    {role}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

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