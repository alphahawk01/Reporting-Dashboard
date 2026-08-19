"use client";

import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

import {
  getAutoDownloadAnalysts,
  type AutoDownloadAnalyst,
} from "@/lib/api/analysts";

type Team = {
  id: number;
  team_name: string;
};

type Affiliation = {
  id: number;
  analyst_name: string;
  team_id: number;
};

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [analysts, setAnalysts] = useState<AutoDownloadAnalyst[]>([]);
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);

  const [selectedTeamId, setSelectedTeamId] =
    useState<number | null>(null);

  const [teamSearch, setTeamSearch] = useState("");
  const [analystSearch, setAnalystSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // --------------------------------------------------
  // LOAD DATA
  // --------------------------------------------------

  async function loadData() {
    try {
      const [
        teamsResult,
        affiliationsResult,
        analystResult,
      ] = await Promise.all([
        supabase
          .from("teams")
          .select("id, team_name")
          .order("team_name"),

        supabase
          .from("analyst_team_affiliations")
          .select("id, analyst_name, team_id"),

        getAutoDownloadAnalysts(),
      ]);

      if (teamsResult.error) {
        throw teamsResult.error;
      }

      if (affiliationsResult.error) {
        throw affiliationsResult.error;
      }

      const loadedTeams =
        (teamsResult.data ?? []) as Team[];

      setTeams(loadedTeams);

      setAffiliations(
        (affiliationsResult.data ?? []) as Affiliation[]
      );

      setAnalysts(
        Array.isArray(analystResult)
          ? analystResult
          : []
      );

      // Select the first team when nothing
      // has been selected yet.
      if (
        selectedTeamId === null &&
        loadedTeams.length > 0
      ) {
        setSelectedTeamId(
          loadedTeams[0].id
        );
      }

    } catch (error) {
      console.error(
        "Failed loading team affiliations:",
        error
      );

      alert(
        "Failed loading teams and affiliations."
      );

    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // --------------------------------------------------
  // FILTER TEAMS
  // --------------------------------------------------

  const filteredTeams = useMemo(() => {
    const search =
      teamSearch
        .trim()
        .toLowerCase();

    if (!search) {
      return teams;
    }

    return teams.filter(team =>
      team.team_name
        .toLowerCase()
        .includes(search)
    );
  }, [
    teams,
    teamSearch,
  ]);

  // --------------------------------------------------
  // SELECTED TEAM
  // --------------------------------------------------

  const selectedTeam = useMemo(() => {
    return teams.find(
      team =>
        team.id === selectedTeamId
    ) ?? null;
  }, [
    teams,
    selectedTeamId,
  ]);

  // --------------------------------------------------
  // CURRENT AFFILIATED ANALYSTS
  // --------------------------------------------------

  const affiliatedAnalysts = useMemo(() => {
    if (selectedTeamId === null) {
      return [];
    }

    return affiliations
      .filter(
        affiliation =>
          affiliation.team_id ===
          selectedTeamId
      )
      .sort((a, b) =>
        a.analyst_name.localeCompare(
          b.analyst_name
        )
      );

  }, [
    affiliations,
    selectedTeamId,
  ]);

  // --------------------------------------------------
  // AVAILABLE ANALYSTS
  // --------------------------------------------------

  const availableAnalysts = useMemo(() => {
    if (selectedTeamId === null) {
      return [];
    }

    const assignedNames =
      new Set(
        affiliations
          .filter(
            affiliation =>
              affiliation.team_id ===
              selectedTeamId
          )
          .map(
            affiliation =>
              affiliation.analyst_name
                .trim()
                .toLowerCase()
          )
      );

    const search =
      analystSearch
        .trim()
        .toLowerCase();

    return analysts
      .filter(analyst => {

        const name =
          analyst.name
            .trim()
            .toLowerCase();

        // Already affiliated
        if (assignedNames.has(name)) {
          return false;
        }

        // Search
        if (
          search &&
          !name.includes(search)
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      );

  }, [
    analysts,
    affiliations,
    selectedTeamId,
    analystSearch,
  ]);

  // --------------------------------------------------
  // TEAM ANALYST COUNT
  // --------------------------------------------------

  function getTeamAnalystCount(
    teamId: number
  ) {
    return affiliations.filter(
      affiliation =>
        affiliation.team_id === teamId
    ).length;
  }

  // --------------------------------------------------
  // ADD ANALYST
  // --------------------------------------------------

  async function addAnalyst(
    analyst: AutoDownloadAnalyst
  ) {
    if (selectedTeamId === null) {
      return;
    }

    setSaving(true);

    try {
      const { error } =
        await supabase
          .from(
            "analyst_team_affiliations"
          )
          .insert({
            analyst_name:
              analyst.name.trim(),

            team_id:
              selectedTeamId,
          });

      if (error) {
        throw error;
      }

      // Clear search after adding
      setAnalystSearch("");

      await loadData();

    } catch (error) {
      console.error(
        "Failed adding analyst:",
        error
      );

      alert(
        "Failed adding analyst to team."
      );

    } finally {
      setSaving(false);
    }
  }

  // --------------------------------------------------
  // REMOVE ANALYST
  // --------------------------------------------------

  async function removeAnalyst(
    affiliationId: number
  ) {
    setSaving(true);

    try {
      const { error } =
        await supabase
          .from(
            "analyst_team_affiliations"
          )
          .delete()
          .eq(
            "id",
            affiliationId
          );

      if (error) {
        throw error;
      }

      await loadData();

    } catch (error) {
      console.error(
        "Failed removing analyst:",
        error
      );

      alert(
        "Failed removing analyst."
      );

    } finally {
      setSaving(false);
    }
  }

  // --------------------------------------------------
  // LOADING
  // --------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1220] p-8 text-slate-200">
        Loading teams...
      </div>
    );
  }

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-200">

      <div className="mx-auto w-full max-w-[1800px] px-6 py-8">

        {/* PAGE HEADER */}

        <div className="mb-6">

          <h1 className="text-3xl font-bold text-white">
            Team Affiliations
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Manage which analysts are affiliated
            with each team.
          </p>

        </div>

        {/* MAIN LAYOUT */}

        <div className="grid h-[calc(100vh-180px)] min-h-0 grid-cols-[250px_minmax(0,1fr)] gap-5">
          {/* ==================================================
              TEAMS SIDEBAR
              ================================================== */}

          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#0f1b2d]">

            {/* TEAM HEADER */}

            <div className="border-b border-slate-700 p-4">

              <div className="flex items-center justify-between">

                <div>

                  <h2 className="text-base font-bold text-white">
                    Teams
                  </h2>

                  <div className="mt-0.5 text-xs text-slate-500">
                    {teams.length} teams
                  </div>

                </div>

              </div>

              {/* TEAM SEARCH */}

              <input
                value={teamSearch}
                onChange={e =>
                  setTeamSearch(
                    e.target.value
                  )
                }
                placeholder="Search teams..."
                className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600 focus:border-sky-500"
              />

            </div>

            {/* TEAM LIST */}

            <div className="min-h-0 flex-1 overflow-y-auto p-2">

              {filteredTeams.length === 0 ? (

                <div className="p-4 text-center text-xs text-slate-500">
                  No teams found.
                </div>

              ) : (

                filteredTeams.map(team => {

                  const count =
                    getTeamAnalystCount(
                      team.id
                    );

                  const selected =
                    selectedTeamId ===
                    team.id;

                  return (
                    <button
                      key={team.id}
                      onClick={() => {
                        setSelectedTeamId(
                          team.id
                        );
                        setAnalystSearch("");
                      }}
                      className={`
                        mb-1
                        flex
                        w-full
                        items-center
                        justify-between
                        rounded-lg
                        px-3
                        py-2.5
                        text-left
                        transition
                        ${selected
                          ? "bg-sky-600/20 text-white ring-1 ring-sky-500/40"
                          : "text-slate-300 hover:bg-slate-800"
                        }
                      `}
                    >

                      <span className="min-w-0 truncate text-sm font-medium">
                        {team.team_name}
                      </span>

                      <span
                        className={`
                          ml-2
                          shrink-0
                          rounded-full
                          px-2
                          py-0.5
                          text-[10px]
                          font-semibold
                          ${selected
                            ? "bg-sky-500/20 text-sky-300"
                            : "bg-slate-800 text-slate-500"
                          }
                        `}
                      >
                        {count}
                      </span>

                    </button>
                  );

                })

              )}

            </div>

          </div>

          {/* ==================================================
              TEAM DETAILS
              ================================================== */}

          <div className="min-w-0 min-h-0 overflow-y-auto pr-1">
            {!selectedTeam ? (

              <div className="rounded-xl border border-slate-700 bg-[#0f1b2d] p-10 text-center text-slate-500">
                Select a team.
              </div>

            ) : (

              <div className="space-y-5">

                {/* TEAM HEADER */}

                <div className="rounded-xl border border-slate-700 bg-[#0f1b2d] px-6 py-5">

                  <div className="flex items-center justify-between">

                    <div className="min-w-0 min-h-0 overflow-y-auto pr-1">

                      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        Team
                      </div>

                      <h2 className="mt-1 truncate text-2xl font-bold text-white">
                        {selectedTeam.team_name}
                      </h2>

                    </div>

                    <div className="ml-4 shrink-0 rounded-lg bg-sky-500/10 px-4 py-2 text-center">

                      <div className="text-xl font-bold text-sky-300">
                        {affiliatedAnalysts.length}
                      </div>

                      <div className="text-[10px] uppercase tracking-wide text-slate-500">
                        Analysts
                      </div>

                    </div>

                  </div>

                </div>

                {/* ==================================================
                    AFFILIATED ANALYSTS
                    ================================================== */}

                <div className="rounded-xl border border-slate-700 bg-[#0f1b2d]">

                  <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">

                    <div>

                      <h3 className="text-base font-bold text-white">
                        Affiliated Analysts
                      </h3>

                      <p className="mt-0.5 text-xs text-slate-500">
                        Analysts currently affiliated
                        with this team.
                      </p>

                    </div>

                  </div>

                  <div className="p-4">

                    {affiliatedAnalysts.length === 0 ? (

                      <div className="rounded-lg border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-500">
                        No analysts affiliated
                        with this team.
                      </div>

                    ) : (

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

                        {affiliatedAnalysts.map(
                          affiliation => (

                            <div
                              key={
                                affiliation.id
                              }
                              className="flex min-w-0 items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5"
                            >

                              <span className="min-w-0 truncate text-sm font-medium text-white">
                                {
                                  affiliation.analyst_name
                                }
                              </span>

                              <button
                                disabled={saving}
                                onClick={() =>
                                  removeAnalyst(
                                    affiliation.id
                                  )
                                }
                                className="ml-3 shrink-0 text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                              >
                                Remove
                              </button>

                            </div>

                          )
                        )}

                      </div>

                    )}

                  </div>

                </div>

                {/* ==================================================
                    ADD ANALYST
                    ================================================== */}

                <div className="rounded-xl border border-slate-700 bg-[#0f1b2d]">

                  <div className="border-b border-slate-700 px-5 py-4">

                    <h3 className="text-base font-bold text-white">
                      Add Analyst
                    </h3>

                    <p className="mt-0.5 text-xs text-slate-500">
                      Add an existing analyst to{" "}
                      <span className="text-slate-300">
                        {selectedTeam.team_name}
                      </span>
                      .
                    </p>

                  </div>

                  <div className="p-4">

                    {/* ANALYST SEARCH */}

                    <input
                      value={analystSearch}
                      onChange={e =>
                        setAnalystSearch(
                          e.target.value
                        )
                      }
                      placeholder="Search analysts..."
                      className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500"
                    />

                    {/* ANALYST RESULTS */}

                    <div className="max-h-[300px] overflow-y-auto rounded-lg border border-slate-700">

                      {availableAnalysts.length === 0 ? (

                        <div className="px-4 py-6 text-center text-sm text-slate-500">
                          {analystSearch
                            ? "No matching analysts."
                            : "All analysts are already affiliated with this team."}
                        </div>

                      ) : (

                        availableAnalysts.map(
                          analyst => (

                            <div
                              key={analyst.id}
                              className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 last:border-b-0 hover:bg-slate-800/50"
                            >

                              <span className="text-sm font-medium text-slate-200">
                                {analyst.name}
                              </span>

                              <button
                                disabled={saving}
                                onClick={() =>
                                  addAnalyst(
                                    analyst
                                  )
                                }
                                className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Add
                              </button>

                            </div>

                          )
                        )

                      )}

                    </div>

                  </div>

                </div>

              </div>

            )}

          </div>

        </div>

      </div>

    </div>
  );
}