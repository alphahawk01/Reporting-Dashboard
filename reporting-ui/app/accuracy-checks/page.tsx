"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Trophy, History, Trash2, X, Flag } from "lucide-react";
import {
  getAllAccuracyChecks,
  countMasterChecks,
  summariseByAnalyst,
  deleteAccuracyCheck,
  type AccuracyCheck,
} from "@/lib/api/accuracyChecks";
import {
  getOpenDisputeCounts,
  getDisputesForCheck,
  resolveDispute,
  type Dispute,
} from "@/lib/api/disputes";
import {
  parseInstances,
  canonicaliseTeams,
  compareInstances,
  detectSportFromXml,
  type Instance,
} from "@/lib/comparison/xml-compare";
import { useAuth } from "@/components/auth/AuthContext";
import DisputesPanel from "@/components/DisputesPanel";
import SportToggle, { type SportFilter } from "@/components/SportToggle";

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function accColor(a: number) {
  if (a >= 0.9) return "text-emerald-600";
  if (a >= 0.7) return "text-amber-600";
  return "text-red-600";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Pull the Home / Away accuracy out of a check's stored team breakdown.
// Teams are canonicalised to "Home"/"Away" at comparison time, so we can
// read them straight off team_breakdown without touching the schema.
function homeAwayAccuracy(check: AccuracyCheck): {
  home: number | null;
  away: number | null;
} {
  const find = (name: string) =>
    check.team_breakdown?.find(
      (t) => t.team.trim().toLowerCase() === name && t.masterTotal > 0
    ) ?? null;
  const home = find("home");
  const away = find("away");
  return {
    home: home ? home.accuracy : null,
    away: away ? away.accuracy : null,
  };
}

type TeamScope = "both" | "home" | "away";

// Per-category accuracy for a check, scoped to Both / Home / Away. Computed
// by re-parsing the stored XML (the only place home/away-per-category data
// exists), the same way the Accuracy Comparison breakdown does it.
// Returns category -> { accuracy, exact, total }.
function categoryAccuracy(
  check: AccuracyCheck,
  scope: TeamScope
): Record<string, { accuracy: number; exact: number; total: number }> {
  if (!check.xml_master || !check.xml_analyst) return {};
  const master = parseInstances(check.xml_master);
  const analyst = parseInstances(check.xml_analyst);
  const tol = check.tolerance ?? 3;
  const canon = canonicaliseTeams(master, analyst, tol);

  const wanted = scope === "both" ? null : scope; // "home" | "away"
  const inScope = (i: Instance) =>
    wanted == null || i.team.trim().toLowerCase() === wanted;

  const result = compareInstances(
    canon.master.filter(inScope),
    canon.analyst.filter(inScope),
    tol
  );

  const out: Record<string, { accuracy: number; exact: number; total: number }> =
    {};
  for (const c of result.byCategory) {
    out[c.category] = {
      accuracy: c.accuracy,
      exact: c.exact,
      total: c.total,
    };
  }
  return out;
}

// One analyst's row within a master-fixture group.
type FixtureRow = {
  check: AccuracyCheck;
  analyst: string;
  date: string;
  overallAcc: number;
  // Per-category accuracy for the active scope: category -> accuracy (0..1).
  categories: Record<string, number>;
};

export default function AccuracyChecksPage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const canResolve =
    user?.role === "admin" || user?.role === "super_admin";

  // All loaded checks; `checks` below applies the sport filter.
  const [allChecks, setAllChecks] = useState<AccuracyCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnalyst, setSelectedAnalyst] = useState<string>("");
  // Sport filter (all | afl | football), matching Accuracy Comparison.
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");

  // Effective sport per check: stored value, else inferred from the master
  // XML (so older checks without a sport are classified correctly).
  const sportByCheck = useMemo(() => {
    const m = new Map<number, "afl" | "football">();
    for (const c of allChecks) {
      const stored =
        c.sport === "afl" || c.sport === "football" ? c.sport : null;
      m.set(c.id, stored ?? detectSportFromXml(c.xml_master) ?? "afl");
    }
    return m;
  }, [allChecks]);

  const checks = useMemo(() => {
    if (sportFilter === "all") return allChecks;
    return allChecks.filter((c) => sportByCheck.get(c.id) === sportFilter);
  }, [allChecks, sportFilter, sportByCheck]);

  // Open-dispute counts per check id (for the badge), and the currently
  // expanded check's disputes panel.
  const [openCounts, setOpenCounts] = useState<Record<number, number>>({});
  const [expandedCheck, setExpandedCheck] = useState<number | null>(null);
  const [panelDisputes, setPanelDisputes] = useState<Dispute[]>([]);

  // Open a saved check fully in the Accuracy Comparison tab.
  function openCheck(id: number) {
    router.push(`/accuracy-compare?check=${id}`);
  }

  async function loadDisputePanel(checkId: number) {
    try {
      setPanelDisputes(await getDisputesForCheck(checkId));
    } catch (err) {
      console.error(err);
    }
  }

  function toggleDisputes(checkId: number) {
    if (expandedCheck === checkId) {
      setExpandedCheck(null);
      setPanelDisputes([]);
    } else {
      setExpandedCheck(checkId);
      loadDisputePanel(checkId);
    }
  }

  async function handleResolve(
    disputeId: number,
    status: "confirmed" | "denied",
    note: string | null
  ) {
    try {
      await resolveDispute(disputeId, status, user?.username ?? null, note);
      if (expandedCheck != null) await loadDisputePanel(expandedCheck);
      setOpenCounts(await getOpenDisputeCounts());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resolve dispute.");
    }
  }

  async function load() {
    try {
      setLoading(true);
      const [data, counts] = await Promise.all([
        getAllAccuracyChecks(),
        getOpenDisputeCounts().catch(() => ({}) as Record<number, number>),
      ]);

      // Admins/super admins see everything. Any other role (analyst) sees
      // ONLY checks saved against their own allocated name — and nothing if
      // they have no allocated name (never fall back to showing all).
      const isAdmin =
        user?.role === "admin" || user?.role === "super_admin";
      const own = user?.analyst_name?.trim().toLowerCase() ?? "";
      const scoped = isAdmin
        ? data
        : data.filter(
            (c) => !!own && c.analyst_name.trim().toLowerCase() === own
          );

      setAllChecks(scoped);
      setOpenCounts(counts);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to load accuracy checks."
      );
    } finally {
      setLoading(false);
    }
  }

  // Wait until auth is ready (session restored) before loading, so the
  // analyst-scoping filter runs against the real user, not a half-loaded one.
  useEffect(() => {
    if (!ready) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.role, user?.analyst_name]);

  const analystSummaries = useMemo(
    () => summariseByAnalyst(checks),
    [checks]
  );

  const masterCounts = useMemo(() => countMasterChecks(checks), [checks]);

  // Empty selectedAnalyst = "All analysts" (the default view). Checks are
  // shown oldest-first per analyst, or all checks newest-first for "All".
  const analystChecks = useMemo(() => {
    if (!selectedAnalyst) {
      return [...checks].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return checks
      .filter(
        (c) =>
          c.analyst_name.trim().toLowerCase() ===
          selectedAnalyst.trim().toLowerCase()
      )
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }, [checks, selectedAnalyst]);

  const trendData = useMemo(
    () =>
      analystChecks.map((c, i) => ({
        idx: i + 1,
        label: c.match_label || formatDate(c.created_at),
        accuracy: Number((c.accuracy * 100).toFixed(1)),
      })),
    [analystChecks]
  );

  const analystRollup = useMemo(
    () =>
      analystSummaries.find(
        (s) =>
          s.analystName.trim().toLowerCase() ===
          selectedAnalyst.trim().toLowerCase()
      ),
    [analystSummaries, selectedAnalyst]
  );

  const [expandedFixture, setExpandedFixture] = useState<string | null>(null);
  const [fixtureSearch, setFixtureSearch] = useState("");
  // Both / Home / Away scope for the category accuracy columns.
  const [fixtureScope, setFixtureScope] = useState<TeamScope>("both");
  // Sort: "analyst" | "date" | a category name.
  const [fixtureSort, setFixtureSort] = useState<{
    key: string;
    dir: "asc" | "desc";
  }>({ key: "date", dir: "asc" });

  function toggleFixtureSort(key: string) {
    setFixtureSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }

  // Group checks by master fixture, computing per-category accuracy for the
  // active scope (recomputed from the stored XML so Home/Away work).
  const masterFixtureGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        masterBy: string | null;
        rows: FixtureRow[];
        categories: Set<string>;
      }
    >();

    for (const c of checks) {
      const key = (c.file_name_master || c.match_label || `check-${c.id}`)
        .trim();
      if (!key) continue;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          label: c.file_name_master || c.match_label || key,
          masterBy: c.master_analyst_name ?? null,
          rows: [],
          categories: new Set(),
        };
        map.set(key, g);
      }
      const cats = categoryAccuracy(c, fixtureScope);
      const flat: Record<string, number> = {};
      for (const [cat, v] of Object.entries(cats)) {
        flat[cat] = v.accuracy;
        g.categories.add(cat);
      }
      g.rows.push({
        check: c,
        analyst: c.analyst_name,
        date: c.created_at,
        overallAcc: c.accuracy,
        categories: flat,
      });
    }

    return Array.from(map.values())
      .map((g) => ({
        ...g,
        categoryList: Array.from(g.categories).sort((a, b) =>
          a.localeCompare(b)
        ),
      }))
      .sort(
        (a, b) =>
          b.rows.length - a.rows.length || a.label.localeCompare(b.label)
      );
  }, [checks, fixtureScope]);

  function sortFixtureRows(rows: FixtureRow[]): FixtureRow[] {
    const { key, dir } = fixtureSort;
    const mult = dir === "asc" ? 1 : -1;
    const val = (r: FixtureRow): number | string | null => {
      if (key === "analyst") return r.analyst.toLowerCase();
      if (key === "date") return new Date(r.date).getTime();
      if (key === "overallAcc") return r.overallAcc;
      // Otherwise it's a category name.
      return r.categories[key] ?? null;
    };
    return [...rows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * mult;
      }
      return ((av as number) - (bv as number)) * mult;
    });
  }

  const filteredFixtureGroups = useMemo(() => {
    const q = fixtureSearch.trim().toLowerCase();
    if (!q) return masterFixtureGroups;
    return masterFixtureGroups.filter(
      (g) =>
        g.label.toLowerCase().includes(q) ||
        (g.masterBy ?? "").toLowerCase().includes(q)
    );
  }, [masterFixtureGroups, fixtureSearch]);

  async function handleDelete(id: number) {
    if (!confirm("Delete this saved accuracy check?")) return;
    try {
      await deleteAccuracyCheck(id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  if (loading) {
    return (
      <div className="min-h-full bg-slate-100 p-8 text-slate-600">
        Loading accuracy checks...
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-[1600px] p-6 lg:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
              <History size={26} /> Accuracy History
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Accuracy checks accumulated over the season. Track each analyst&apos;s
              trend and see who has completed the most master checks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SportToggle value={sportFilter} onChange={setSportFilter} />
            <Link
              href="/accuracy-compare"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            >
              New comparison
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {allChecks.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            No accuracy checks saved yet. Run a comparison and save it to build
            history here.
          </div>
        ) : checks.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            No {sportFilter === "afl" ? "Aussie Rules" : "Football"} checks
            saved yet.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top: analyst picker + trend (left) and leaderboard (right) */}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
            {/* LEFT: analyst picker + trend */}
            <div className="space-y-6">
              {/* Analyst picker */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Analyst
                </label>
                <select
                  value={selectedAnalyst}
                  onChange={(e) => setSelectedAnalyst(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
                >
                  <option value="">
                    All analysts ({checks.length} check
                    {checks.length === 1 ? "" : "s"})
                  </option>
                  {analystSummaries.map((s) => (
                    <option key={s.analystName} value={s.analystName}>
                      {s.analystName} ({s.checks} check{s.checks === 1 ? "" : "s"})
                    </option>
                  ))}
                </select>

                {analystRollup && (
                  <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
                    <Stat label="Checks" value={`${analystRollup.checks}`} />
                    <Stat
                      label="Avg accuracy"
                      value={pct(analystRollup.avgAccuracy)}
                      color={accColor(analystRollup.avgAccuracy)}
                    />
                    <Stat
                      label="Latest"
                      value={pct(analystRollup.latestAccuracy)}
                      color={accColor(analystRollup.latestAccuracy)}
                    />
                    <Stat
                      label="Avg home"
                      value={
                        analystRollup.avgHomeAccuracy != null
                          ? pct(analystRollup.avgHomeAccuracy)
                          : "—"
                      }
                      color={
                        analystRollup.avgHomeAccuracy != null
                          ? accColor(analystRollup.avgHomeAccuracy)
                          : undefined
                      }
                    />
                    <Stat
                      label="Avg away"
                      value={
                        analystRollup.avgAwayAccuracy != null
                          ? pct(analystRollup.avgAwayAccuracy)
                          : "—"
                      }
                      color={
                        analystRollup.avgAwayAccuracy != null
                          ? accColor(analystRollup.avgAwayAccuracy)
                          : undefined
                      }
                    />
                    <Stat
                      label="Exact / Master"
                      value={`${analystRollup.totalExact}/${analystRollup.totalMaster}`}
                    />
                  </div>
                )}
              </div>

              {/* Trend chart */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">
                  Accuracy trend
                </h2>
                {!selectedAnalyst ? (
                  <p className="text-sm text-slate-400">
                    Select an analyst to see their accuracy trend.
                  </p>
                ) : trendData.length < 2 ? (
                  <p className="text-sm text-slate-400">
                    Need at least 2 saved checks to show a trend.
                  </p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
                        <XAxis dataKey="idx" tick={{ fontSize: 11, fill: "#64748B" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748B" }} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          formatter={(v: any) => [`${v}%`, "Accuracy"]}
                          labelFormatter={(_l, p) => (p?.[0]?.payload?.label ?? "")}
                        />
                        <Line type="monotone" dataKey="accuracy" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: master-checks leaderboard */}
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Trophy size={16} className="text-amber-500" /> Master checks completed
                </h2>
                <p className="mb-4 text-xs text-slate-400">
                  How many accuracy checks each person has completed as the
                  master coder.
                </p>

                {masterCounts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    No master checks recorded yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {masterCounts.map((m, i) => (
                      <div
                        key={m.masterAnalystName}
                        className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-400">
                            {i + 1}
                          </span>
                          <span className="truncate text-sm font-medium text-slate-700">
                            {m.masterAnalystName}
                          </span>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-bold text-white">
                          {m.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            </div>

            {/* Saved checks — full width */}
            <div>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <h2 className="border-b border-slate-100 p-5 text-sm font-semibold text-slate-700">
                  Saved checks
                </h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Match</th>
                        {!selectedAnalyst && (
                          <th className="px-4 py-2.5">Analyst</th>
                        )}
                        <th className="px-4 py-2.5">Master by</th>
                        <th className="px-4 py-2.5 text-right">Overall</th>
                        <th className="px-4 py-2.5 text-right">Home</th>
                        <th className="px-4 py-2.5 text-right">Away</th>
                        <th className="px-4 py-2.5 text-right">Exact/Master</th>
                        <th className="px-4 py-2.5 text-center">Disputes</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...analystChecks]
                        .sort(
                          (a, b) =>
                            new Date(b.created_at).getTime() -
                            new Date(a.created_at).getTime()
                        )
                        .map((c) => {
                          const { home, away } = homeAwayAccuracy(c);
                          return (
                          <React.Fragment key={c.id}>
                          <tr
                            onClick={() => openCheck(c.id)}
                            className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                            title="Open full accuracy check in Accuracy Comparison"
                          >
                            <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                              {formatDate(c.created_at)}
                            </td>
                            <td className="px-4 py-2.5 text-slate-700">
                              <span
                                className="block max-w-[420px] truncate"
                                title={c.match_label || undefined}
                              >
                                {c.match_label || "—"}
                              </span>
                            </td>
                            {!selectedAnalyst && (
                              <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-700">
                                {c.analyst_name || "—"}
                              </td>
                            )}
                            <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                              {c.master_analyst_name || "—"}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-semibold ${accColor(c.accuracy)}`}>
                              {pct(c.accuracy)}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-medium ${home != null ? accColor(home) : "text-slate-300"}`}>
                              {home != null ? pct(home) : "—"}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-medium ${away != null ? accColor(away) : "text-slate-300"}`}>
                              {away != null ? pct(away) : "—"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-600">
                              {c.exact}/{c.master_total}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {(openCounts[c.id] ?? 0) > 0 ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleDisputes(c.id);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-200"
                                  title="Review disputes"
                                >
                                  <Flag size={11} /> {openCounts[c.id]}
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleDisputes(c.id);
                                  }}
                                  className="text-xs text-slate-400 hover:text-slate-600"
                                  title="View disputes"
                                >
                                  —
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(c.id);
                                }}
                                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                title="Delete check"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                          {expandedCheck === c.id && (
                            <tr className="border-t border-slate-100 bg-slate-50/60">
                              <td colSpan={selectedAnalyst ? 9 : 10} className="px-4 py-3">
                                <DisputesPanel
                                  disputes={panelDisputes}
                                  canResolve={canResolve}
                                  onResolve={handleResolve}
                                  onOpen={(d) => {
                                    const params = new URLSearchParams({
                                      check: String(d.check_id),
                                    });
                                    if (d.code_time != null)
                                      params.set("seek", String(d.code_time));
                                    if (d.stat) params.set("stat", d.stat);
                                    router.push(
                                      `/accuracy-compare?${params.toString()}`
                                    );
                                  }}
                                />
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BY MASTER FIXTURE — every check grouped by the master file, with
            each analyst's overall / home / away accuracy. */}
        {checks.length > 0 && masterFixtureGroups.length > 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
              <h2 className="text-sm font-semibold text-slate-700">
                Checks by master fixture
              </h2>
              <div className="flex items-center gap-3">
                {/* Both / Home / Away scope for the category % columns */}
                <div className="flex items-center gap-1">
                  {(
                    [
                      ["both", "Both teams"],
                      ["home", "Home"],
                      ["away", "Away"],
                    ] as [TeamScope, string][]
                  ).map(([s, label]) => (
                    <button
                      key={s}
                      onClick={() => setFixtureScope(s)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        fixtureScope === s
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  value={fixtureSearch}
                  onChange={(e) => setFixtureSearch(e.target.value)}
                  placeholder="Search fixture or master…"
                  className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500"
                />
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredFixtureGroups.map((g) => {
                const isOpen = expandedFixture === g.key;
                return (
                  <div key={g.key}>
                    <button
                      onClick={() =>
                        setExpandedFixture(isOpen ? null : g.key)
                      }
                      className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50"
                    >
                      <span className="shrink-0 text-slate-400">
                        {isOpen ? "▾" : "▸"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {g.label}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {g.masterBy ? `Master by ${g.masterBy} · ` : ""}
                          {g.rows.length} check
                          {g.rows.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="overflow-x-auto bg-slate-50/60 px-5 pb-4">
                        <table className="min-w-full text-sm">
                          <thead className="text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="py-2 pr-4 text-left">
                                <SortHead
                                  label="Analyst"
                                  col="analyst"
                                  sort={fixtureSort}
                                  onSort={toggleFixtureSort}
                                  align="left"
                                />
                              </th>
                              <th className="py-2 pr-4 text-left">
                                <SortHead
                                  label="Date"
                                  col="date"
                                  sort={fixtureSort}
                                  onSort={toggleFixtureSort}
                                  align="left"
                                />
                              </th>
                              <th className="border-l border-slate-200 py-2 px-3 text-center">
                                <SortHead
                                  label="Overall"
                                  col="overallAcc"
                                  sort={fixtureSort}
                                  onSort={toggleFixtureSort}
                                  align="center"
                                />
                              </th>
                              {g.categoryList.map((cat) => (
                                <th
                                  key={cat}
                                  className="py-2 px-3 text-center"
                                >
                                  <SortHead
                                    label={cat}
                                    col={cat}
                                    sort={fixtureSort}
                                    onSort={toggleFixtureSort}
                                    align="center"
                                  />
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sortFixtureRows(g.rows).map((r) => (
                              <tr
                                key={r.check.id}
                                onClick={() => openCheck(r.check.id)}
                                className="cursor-pointer border-t border-slate-200 hover:bg-white"
                                title="Open full accuracy check"
                              >
                                <td className="py-2 pr-4 font-medium text-slate-800">
                                  {r.analyst}
                                </td>
                                <td className="whitespace-nowrap py-2 pr-4 text-slate-600">
                                  {formatDate(r.date)}
                                </td>
                                <td
                                  className={`border-l border-slate-200 py-2 px-3 text-center font-semibold tabular-nums ${accColor(
                                    r.overallAcc
                                  )}`}
                                >
                                  {pct(r.overallAcc)}
                                </td>
                                {g.categoryList.map((cat) => {
                                  const v = r.categories[cat];
                                  return (
                                    <td
                                      key={cat}
                                      className={`py-2 px-3 text-center font-medium tabular-nums ${
                                        v != null
                                          ? accColor(v)
                                          : "text-slate-300"
                                      }`}
                                    >
                                      {v != null ? pct(v) : "—"}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {g.categoryList.length === 0 && (
                          <p className="pt-2 text-xs text-slate-400">
                            Category breakdown needs the saved XML; older checks
                            may not have it.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredFixtureGroups.length === 0 && (
                <p className="p-6 text-center text-sm text-slate-400">
                  No fixtures match your search.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// Full detail of a saved accuracy check: summary cards + category and
// team breakdowns (everything that was stored at save time).
function CheckDetailModal({
  check,
  onClose,
}: {
  check: AccuracyCheck;
  onClose: () => void;
}) {
  const cards: { label: string; value: string; color?: string }[] = [
    { label: "Accuracy", value: pct(check.accuracy), color: accColor(check.accuracy) },
    { label: "Exact", value: `${check.exact}`, color: "text-emerald-600" },
    { label: "Wrong stat", value: `${check.wrong_stat}`, color: "text-amber-600" },
    { label: "Wrong player", value: `${check.wrong_player}`, color: "text-orange-600" },
    { label: "Wrong team", value: `${check.wrong_team}`, color: "text-red-600" },
    { label: "Missed", value: `${check.missed}`, color: "text-slate-600" },
    { label: "Extra", value: `${check.extra}`, color: "text-purple-600" },
    { label: "Master total", value: `${check.master_total}` },
    { label: "Analyst total", value: `${check.analyst_total}` },
    { label: "Avg time drift", value: `${(check.avg_time_drift ?? 0).toFixed(1)}s` },
  ];

  const barColor = (a: number) =>
    a >= 0.9 ? "bg-emerald-500" : a >= 0.7 ? "bg-amber-500" : "bg-red-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-6 w-full max-w-4xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {check.match_label || "Accuracy check"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {check.analyst_name}
              {check.master_analyst_name
                ? ` · master by ${check.master_analyst_name}`
                : ""}
              {" · "}
              {formatDate(check.created_at)}
              {check.tolerance != null ? ` · ±${check.tolerance}s tolerance` : ""}
            </p>
            {(check.file_name_master || check.file_name_analyst) && (
              <p className="mt-1 text-xs text-slate-400">
                {check.file_name_master ?? "?"} vs{" "}
                {check.file_name_analyst ?? "?"}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-5">
          {cards.map((c) => (
            <Stat key={c.label} label={c.label} value={c.value} color={c.color} />
          ))}
        </div>

        {/* Category breakdown */}
        {check.category_breakdown && check.category_breakdown.length > 0 && (
          <div className="border-t border-slate-100 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              Accuracy by stat category
            </h3>
            <div className="space-y-1">
              {check.category_breakdown.map((c) => (
                <div
                  key={c.category}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5"
                >
                  <span className="w-40 shrink-0 truncate text-sm text-slate-600">
                    {c.category}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${barColor(c.accuracy)}`}
                      style={{ width: `${c.accuracy * 100}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-slate-500">
                    {(c.accuracy * 100).toFixed(0)}% ({c.exact}/{c.total})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Team breakdown */}
        {check.team_breakdown && check.team_breakdown.length > 0 && (
          <div className="border-t border-slate-100 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              Accuracy by team
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {check.team_breakdown
                .filter((t) => t.masterTotal > 0)
                .map((t) => (
                  <div
                    key={t.team}
                    className="rounded-xl border border-slate-200 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-slate-900">
                        {t.team}
                      </span>
                      <span className={`text-sm font-bold ${accColor(t.accuracy)}`}>
                        {(t.accuracy * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${barColor(t.accuracy)}`}
                        style={{ width: `${t.accuracy * 100}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      <span>Exact {t.exact}</span>
                      <span>Wrong stat {t.wrongStat}</span>
                      <span>Wrong player {t.wrongPlayer}</span>
                      <span>Wrong team {t.wrongTeam}</span>
                      <span>Missed {t.missed}</span>
                      <span>Extra {t.extra}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Clickable sort header for the by-master-fixture table.
function SortHead({
  label,
  col,
  sort,
  onSort,
  align = "right",
}: {
  label: string;
  col: string;
  sort: { key: string; dir: "asc" | "desc" };
  onSort: (key: string) => void;
  align?: "left" | "right" | "center";
}) {
  const active = sort.key === col;
  const justify =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start";
  return (
    <button
      onClick={() => onSort(col)}
      className={`inline-flex w-full items-center gap-1 font-semibold uppercase tracking-wide transition hover:text-slate-800 ${
        active ? "text-slate-800" : "text-slate-500"
      } ${justify}`}
    >
      {label}
      <span className="text-[9px]">
        {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-bold ${color ?? "text-slate-800"}`}>
        {value}
      </div>
    </div>
  );
}
