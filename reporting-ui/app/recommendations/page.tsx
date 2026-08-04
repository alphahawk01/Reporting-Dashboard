"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { TTGame } from "@/types/ttgame";
import { buildAnalystMetrics } from "@/lib/analytics/buildAnalystMetrics";
import { buildRecommendations } from "@/lib/recommendations/recommendationEngine";
import type { DeputyShift } from "@/types/deputy";
import type { AnalystMetrics } from "@/types/analyst";
import ScoreBreakdown from "@/components/recommendations/ScoreBreakdown";
import RecommendationTable from "@/components/recommendations/RecommendationTable";
import { format } from "date-fns";


export default function RecommendationPage() {
  const [historicalGames, setHistoricalGames] = useState<TTGame[]>([]);
  const [fixtures, setFixtures] = useState<TTGame[]>([]);
  const [selectedFixture, setSelectedFixture] = useState<TTGame | null>(null);

  const [selectedWeek, setSelectedWeek] = useState(1);

  const [loading, setLoading] = useState(true);

  const [analysts, setAnalysts] = useState<AnalystMetrics[]>([]);

  const [sortField, setSortField] = useState<
    "Week" | "Round" | "Competition" | "home_team" | "away_team"
  >("Week");

  const [sortDirection, setSortDirection] =
    useState<"asc" | "desc">("asc");

  // --------------------------------------------------
  // LOAD HISTORICAL DATA (ONCE)
  // --------------------------------------------------

  useEffect(() => {
    async function loadHistory() {
      setLoading(true);

      const { data: shifts, error: shiftError } =
        await supabase
          .from("deputy_shifts")
          .select("*");

      const allGames: TTGame[] = [];

      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("TT_Games")
          .select("*")
          .order("Week")
          .order("Competition")
          .range(from, from + pageSize - 1);

        if (error) throw error;

        if (!data?.length) break;

        allGames.push(...(data as TTGame[]));

        if (data.length < pageSize) break;

        from += pageSize;
      }

      setHistoricalGames(allGames);

      const firstWeekFixtures = allGames.filter(
        g => Number(g.Week) === 1
      );

      setFixtures(firstWeekFixtures);

      if (firstWeekFixtures.length > 0) {
        setSelectedFixture(firstWeekFixtures[0]);
      }



      if (shiftError || !shifts)
        throw shiftError;

      const analystData =
        buildAnalystMetrics(
          shifts as DeputyShift[],
          allGames
        );

      setAnalysts(analystData);

      setLoading(false);
    }

    loadHistory();
  }, []);

  useEffect(() => {
    if (historicalGames.length === 0) return;

    const weekFixtures = historicalGames.filter(
      g => Number(g.Week) === selectedWeek
    );

    setFixtures(weekFixtures);

    if (weekFixtures.length > 0) {
      setSelectedFixture(weekFixtures[0]);
    } else {
      setSelectedFixture(null);
    }

  }, [selectedWeek, historicalGames]);
  // --------------------------------------------------
  // SORT
  // --------------------------------------------------

  const sortedFixtures = useMemo(() => {
    const sorted = [...fixtures];

    sorted.sort((a, b) => {
      const direction =
        sortDirection === "asc" ? 1 : -1;

      switch (sortField) {
        case "Week":
          return (
            (Number(a.Week) - Number(b.Week)) *
            direction
          );

        case "Round":
          return (
            (a.Round ?? "").localeCompare(
              b.Round ?? ""
            ) * direction
          );

        case "Competition":
          return (
            (a.Competition ?? "").localeCompare(
              b.Competition ?? ""
            ) * direction
          );

        case "home_team":
          return (
            (a.home_team ?? "").localeCompare(
              b.home_team ?? ""
            ) * direction
          );

        case "away_team":
          return (
            (a.away_team ?? "").localeCompare(
              b.away_team ?? ""
            ) * direction
          );

        default:
          return 0;
      }
    });

    return sorted;
  }, [fixtures, sortField, sortDirection]);

  // --------------------------------------------------
  // BUILD RECOMMENDATIONS
  // --------------------------------------------------
  console.log("sortedFixtures:", sortedFixtures.length);

  const selectedRecommendation = useMemo(() => {

    if (
      !selectedFixture ||
      analysts.length === 0
    ) {
      return [];
    }

    return buildRecommendations(
      selectedFixture,
      analysts,
      historicalGames
    );

  }, [
    selectedFixture,
    analysts,
    historicalGames
  ]);
  // --------------------------------------------------
  // KEEP SELECTION VALID
  // --------------------------------------------------

  const availableWeeks = useMemo(() => {
    return [...new Set(
      historicalGames.map(g => Number(g.Week))
    )].sort((a, b) => a - b);
  }, [historicalGames]);



  function handleSort(
    field:
      | "Week"
      | "Round"
      | "Competition"
      | "home_team"
      | "away_team"
  ) {
    if (sortField === field) {
      setSortDirection(
        sortDirection === "asc"
          ? "desc"
          : "asc"
      );
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-200">
      <div className="mx-auto max-w-[1700px] p-8">

        <h1 className="mb-8 text-4xl font-bold">
          Fixture Allocation Engine
        </h1>

        <div className="grid grid-cols-[1100px_1fr] gap-6">
          <div className="rounded-xl border border-slate-700 bg-[#0f1b2d] p-6">

            <h2 className="mb-5 text-xl font-bold">
              Fixtures
            </h2>

            <select
              value={selectedWeek}
              onChange={(e) =>
                setSelectedWeek(Number(e.target.value))
              }
              className="mb-5 w-full rounded border border-slate-700 bg-slate-900 p-2"
            >
              {availableWeeks.map((week) => (
                <option key={week} value={week}>
                  Week {week}
                </option>
              ))}
            </select>

            {loading ? (
              <div>Loading...</div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-700">

                {/* HEADER */}

                <div className="grid grid-cols-[60px_60px_280px_280px_360px] bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">

                  <button
                    onClick={() =>
                      handleSort("Week")
                    }
                    className="text-left hover:text-white"
                  >
                    Week{" "}
                    {sortField === "Week" &&
                      (sortDirection === "asc"
                        ? "▲"
                        : "▼")}
                  </button>

                  <button
                    onClick={() =>
                      handleSort("Round")
                    }
                    className="text-left hover:text-white"
                  >
                    Rnd{" "}
                    {sortField === "Round" &&
                      (sortDirection === "asc"
                        ? "▲"
                        : "▼")}
                  </button>

                  <button
                    onClick={() =>
                      handleSort("home_team")
                    }
                    className="text-left hover:text-white"
                  >
                    Home{" "}
                    {sortField ===
                      "home_team" &&
                      (sortDirection === "asc"
                        ? "▲"
                        : "▼")}
                  </button>

                  <button
                    onClick={() =>
                      handleSort("away_team")
                    }
                    className="text-left hover:text-white"
                  >
                    Away{" "}
                    {sortField ===
                      "away_team" &&
                      (sortDirection === "asc"
                        ? "▲"
                        : "▼")}
                  </button>

                  <button
                    onClick={() =>
                      handleSort(
                        "Competition"
                      )
                    }
                    className="text-left hover:text-white"
                  >
                    Competition{" "}
                    {sortField ===
                      "Competition" &&
                      (sortDirection === "asc"
                        ? "▲"
                        : "▼")}
                  </button>
                </div>

                {/* ROWS */}

                <div className="max-h-[720px] overflow-y-auto">

                  {sortedFixtures.map(
                    (fixture, index) => (
                      <button
                        key={index}
                        onClick={() =>
                          setSelectedFixture(
                            fixture
                          )
                        }
                        className={`grid w-full grid-cols-[60px_60px_280px_280px_360px] items-center gap-3 border-t border-slate-700 px-3 py-2 text-left text-sm transition ${selectedFixture ===
                          fixture
                          ? "bg-sky-500/15"
                          : "hover:bg-slate-800"
                          }`}
                      >
                        <div className="font-semibold text-sky-400">
                          W{fixture.Week}
                        </div>

                        <div className="text-slate-400">
                          {fixture.Round}
                        </div>

                        <div className="font-medium whitespace-normal">
                          {fixture.home_team}
                        </div>

                        <div className="font-medium whitespace-normal">
                          {fixture.away_team}
                        </div>

                        <div
                          className="truncate text-slate-400"
                          title={
                            fixture.Competition
                          }
                        >
                          {fixture.Competition}
                        </div>
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

          </div>

          <div className="rounded-xl border border-slate-700 bg-[#0f1b2d] p-6">

            <h2 className="mb-5 text-xl font-bold">
              Recommendations
            </h2>

            {selectedFixture ? (
              <>
                <div className="rounded-lg border border-slate-700 bg-slate-900 p-5">

                  <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                    Selected Fixture
                  </div>

                  <div className="flex items-center justify-between">

                    <div className="flex-1">

                      <div className="text-2xl font-bold text-white">
                        {selectedFixture.home_team}
                      </div>

                      <div className="my-1 text-slate-500">
                        vs
                      </div>

                      <div className="text-2xl font-bold text-white">
                        {selectedFixture.away_team}
                      </div>

                    </div>

                    <div className="ml-8 text-right">

                      <div className="text-slate-400">
                        Week {selectedFixture.Week}
                      </div>

                      <div className="text-slate-400">
                        Round {selectedFixture.Round}
                      </div>

                    </div>

                  </div>

                  <div className="mt-4 text-sm text-slate-400">
                    {selectedFixture.Competition}
                  </div>

                </div>

                <RecommendationTable
                  recommendation={{
                    fixture: selectedFixture,
                    recommendations: selectedRecommendation
                  }}
                />

              </>
            ) : (
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-8 text-center text-slate-500">
                No fixture selected.
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}