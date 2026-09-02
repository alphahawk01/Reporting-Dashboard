"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import {
  Upload,
  FileText,
  X,
  Sparkles,
  Target,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  ArrowRightLeft,
  Clock,
  Download,
  Save,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { saveAccuracyCheck } from "@/lib/api/accuracyChecks";
import {
  parseInstances,
  compareInstances,
  canonicaliseTeams,
  formatTime,
  parseTime,
  type Instance,
  type ComparisonRow,
  type MatchStatus,
  type TeamBreakdown,
  type StatBreakdown,
} from "@/lib/comparison/xml-compare";
import {
  generateInsights,
  generateRecommendations,
} from "@/lib/comparison/insights";

// Accent colors (lms-platform used custom pd-red / pd-navy tokens; reporting-ui
// doesn't define those, so we map to the closest standard Tailwind colors).
const ACCENT = "red-600"; // was pd-red
const ACCENT_BG = "bg-red-600";
const ACCENT_TEXT = "text-red-600";
const NAVY_BG = "bg-slate-900"; // was pd-navy

type LoadedFile = { name: string; instances: Instance[] };

const STATUS_META: Record<
  MatchStatus,
  { label: string; badge: string; dot: string }
> = {
  exact: {
    label: "Exact",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
  },
  wrong_stat: {
    label: "Wrong stat",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
  },
  wrong_player: {
    label: "Wrong player",
    badge: "bg-orange-100 text-orange-700",
    dot: "bg-orange-500",
  },
  wrong_team: {
    label: "Wrong team",
    badge: "bg-red-100 text-red-700",
    dot: "bg-red-500",
  },
  missed: {
    label: "Missed",
    badge: "bg-slate-200 text-slate-700",
    dot: "bg-slate-400",
  },
  extra: {
    label: "Extra",
    badge: "bg-purple-100 text-purple-700",
    dot: "bg-purple-500",
  },
};

const TONE_META = {
  positive: {
    icon: CheckCircle2,
    ring: "border-emerald-200 bg-emerald-50",
    ic1: "text-emerald-600",
  },
  warning: {
    icon: AlertTriangle,
    ring: "border-amber-200 bg-amber-50",
    ic1: "text-amber-600",
  },
  critical: {
    icon: AlertTriangle,
    ring: "border-red-200 bg-red-50",
    ic1: "text-red-600",
  },
  neutral: {
    icon: Sparkles,
    ring: "border-slate-200 bg-slate-50",
    ic1: "text-slate-500",
  },
};

function Dropzone({
  title,
  subtitle,
  file,
  onLoad,
  onClear,
}: {
  title: string;
  subtitle: string;
  file: LoadedFile | null;
  onLoad: (f: LoadedFile) => void;
  onClear: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    setError(null);
    const f = fileList?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const instances = parseInstances(text);
      if (instances.length === 0) {
        setError("No <instance> entries found in this file.");
        return;
      }
      onLoad({ name: f.name, instances });
    } catch {
      setError("Could not read that file.");
    }
  }

  return (
    <div>
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
          file
            ? "border-emerald-300 bg-emerald-50/50"
            : "border-slate-300 bg-slate-50 hover:border-red-500 hover:bg-red-50/40"
        }`}
      >
        <input
          type="file"
          accept=".xml,text/xml,application/xml"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {file ? (
          <>
            <FileText className="mb-2 text-emerald-600" size={28} />
            <p className="text-sm font-semibold text-slate-900">{file.name}</p>
            <p className="text-xs text-slate-500">
              {file.instances.length} instances parsed
            </p>
          </>
        ) : (
          <>
            <Upload className="mb-2 text-slate-400" size={28} />
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </>
        )}
      </label>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {file && (
        <button
          onClick={onClear}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600"
        >
          <X size={13} /> Remove
        </button>
      )}
    </div>
  );
}

function exportStatCsv(stats: StatBreakdown[]) {
  const header = "Statistic Type,Master,Exact,Accuracy %";
  const lines = stats.map(
    (s) =>
      `${JSON.stringify(s.stat)},${s.total},${s.exact},${(
        s.accuracy * 100
      ).toFixed(1)}`
  );
  const totalMaster = stats.reduce((a, s) => a + s.total, 0);
  const totalExact = stats.reduce((a, s) => a + s.exact, 0);
  const totalAcc = totalMaster > 0 ? (totalExact / totalMaster) * 100 : 0;
  lines.push(`Totals,${totalMaster},${totalExact},${totalAcc.toFixed(1)}`);
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "stat-breakdown.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Derived per-player counts shape (master or analyst side).
type PlayerCounts = {
  effKick: number;
  ineffKick: number;
  effHb: number;
  ineffHb: number;
  marks: number;
  totalKicks: number;
  totalHb: number;
  disposals: number;
};

type PlayerRow = {
  key: string;
  team: string;
  number: number | null;
  master: PlayerCounts;
  analyst: PlayerCounts;
  analystOnly: boolean;
};

const PLAYER_COLS: {
  key: string;
  label: string;
  get: (c: PlayerCounts) => number;
}[] = [
  { key: "disposals", label: "Total Disposals", get: (c) => c.disposals },
  { key: "effKick", label: "Eff Kicks", get: (c) => c.effKick },
  { key: "ineffKick", label: "Ineff Kicks", get: (c) => c.ineffKick },
  { key: "totalKicks", label: "Total Kicks", get: (c) => c.totalKicks },
  { key: "effHb", label: "Eff Handballs", get: (c) => c.effHb },
  { key: "ineffHb", label: "Ineff Handballs", get: (c) => c.ineffHb },
  { key: "totalHb", label: "Total Handballs", get: (c) => c.totalHb },
  { key: "marks", label: "Marks", get: (c) => c.marks },
];

function FragmentSubHead() {
  return (
    <>
      <th className="border-b border-l border-slate-200 px-2 py-1 text-center font-semibold">
        M
      </th>
      <th className="border-b border-slate-200 px-2 py-1 text-center font-semibold">
        A
      </th>
    </>
  );
}

function PlayerCells({
  master,
  analyst,
  mismatch,
}: {
  master: number;
  analyst: number;
  mismatch: boolean;
}) {
  return (
    <>
      <td className="border-l border-slate-200 px-2 py-2 text-center tabular-nums text-slate-700">
        {master}
      </td>
      <td
        className={`px-2 py-2 text-center tabular-nums font-semibold ${
          mismatch ? "text-red-600" : "text-emerald-600"
        }`}
      >
        {analyst}
      </td>
    </>
  );
}

function exportPlayerCsv(rows: PlayerRow[]) {
  const head = ["Player"];
  for (const col of PLAYER_COLS) head.push(`${col.label} (M)`, `${col.label} (A)`);
  head.push("Analyst only");
  const lines = rows.map((p) => {
    const cells: string[] = [JSON.stringify(p.key)];
    for (const col of PLAYER_COLS)
      cells.push(String(col.get(p.master)), String(col.get(p.analyst)));
    cells.push(p.analystOnly ? "yes" : "");
    return cells.join(",");
  });
  const csv = [head.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "player-disposals-marks.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function TeamCard({ team }: { team: TeamBreakdown }) {
  const accColor =
    team.accuracy >= 0.9
      ? "text-emerald-600"
      : team.accuracy >= 0.75
        ? "text-amber-600"
        : "text-red-600";
  const barColor =
    team.accuracy >= 0.9
      ? "bg-emerald-500"
      : team.accuracy >= 0.75
        ? "bg-amber-500"
        : "bg-red-500";

  const chips: { label: string; value: number; cls: string }[] = [
    { label: "Exact", value: team.exact, cls: "text-emerald-600" },
    { label: "Wrong stat", value: team.wrongStat, cls: "text-amber-600" },
    { label: "Wrong player", value: team.wrongPlayer, cls: "text-orange-600" },
    { label: "Wrong team", value: team.wrongTeam, cls: "text-red-600" },
    { label: "Missed", value: team.missed, cls: "text-slate-600" },
    { label: "Extra", value: team.extra, cls: "text-purple-600" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="truncate text-sm font-bold text-slate-900">
          {team.team}
        </h3>
        <span className={`text-lg font-bold ${accColor}`}>
          {(team.accuracy * 100).toFixed(1)}%
        </span>
      </div>
      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${team.accuracy * 100}%` }}
        />
      </div>
      <p className="mb-3 text-xs text-slate-500">
        {team.exact}/{team.masterTotal} master instances exact · avg drift{" "}
        {team.avgTimeDrift.toFixed(1)}s
      </p>
      <div className="grid grid-cols-3 gap-2">
        {chips.map((c) => (
          <div
            key={c.label}
            className="rounded-lg bg-slate-50 px-2 py-1.5 text-center"
          >
            <p className={`text-base font-bold ${c.cls}`}>{c.value}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              {c.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? "text-slate-900"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function AccuracyComparePage() {
  const [master, setMaster] = useState<LoadedFile | null>(null);
  const [analyst, setAnalyst] = useState<LoadedFile | null>(null);
  const [tolerance, setTolerance] = useState(3);
  const [statusFilter, setStatusFilter] = useState<MatchStatus | "all">("all");
  const [teamFilter, setTeamFilter] = useState<string | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");

  const [rangeMode, setRangeMode] = useState<"auto" | "full" | "manual">(
    "auto"
  );
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");

  // Analyst allocation + save
  const [analystNames, setAnalystNames] = useState<string[]>([]);
  const [masterAnalyst, setMasterAnalyst] = useState("");
  const [gradedAnalyst, setGradedAnalyst] = useState("");
  const [matchLabel, setMatchLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Load the distinct analyst names (from Deputy roster) for the
  // allocation dropdowns.
  useEffect(() => {
    let cancelled = false;

    async function loadNames() {
      const names = new Set<string>();
      const pageSize = 1000;
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from("deputy_shifts")
          .select("employee_name")
          .range(from, from + pageSize - 1);

        if (error) {
          console.error("Failed loading analyst names:", error);
          break;
        }
        if (!data || data.length === 0) break;

        for (const r of data) {
          const n = (r as any).employee_name?.trim();
          if (n) names.add(n);
        }

        from += pageSize;
        if (data.length < pageSize) break;
      }

      if (!cancelled) {
        setAnalystNames(Array.from(names).sort((a, b) => a.localeCompare(b)));
      }
    }

    loadNames();
    return () => {
      cancelled = true;
    };
  }, []);

  const analystWindow = useMemo(() => {
    const files = [master, analyst].filter(
      (f): f is LoadedFile => !!f && f.instances.length > 0
    );
    if (files.length === 0) return null;
    const smaller = files.reduce((a, b) =>
      b.instances.length < a.instances.length ? b : a
    );
    const starts = smaller.instances.map((i) => i.start);
    const ends = smaller.instances.map((i) => i.end);
    return {
      start: Math.min(...starts),
      end: Math.max(...ends),
      source: smaller.name,
    };
  }, [master, analyst]);

  const effectiveRange = useMemo(() => {
    if (rangeMode === "full") return { start: -Infinity, end: Infinity };
    if (rangeMode === "manual") {
      const s = parseTime(manualStart);
      const e = parseTime(manualEnd);
      return { start: s ?? -Infinity, end: e ?? Infinity };
    }
    if (analystWindow)
      return { start: analystWindow.start, end: analystWindow.end };
    return { start: -Infinity, end: Infinity };
  }, [rangeMode, manualStart, manualEnd, analystWindow]);

  const inRange = (i: Instance) =>
    i.start >= effectiveRange.start && i.start <= effectiveRange.end;

  // Canonicalise team names to Home/Away ONCE, so team filtering and the
  // player breakdown use the same labels the comparison produces. Without
  // this, clicking a "Home"/"Away" filter would match none of the raw
  // instances (which still carry the original club names).
  const canonical = useMemo(() => {
    if (!master || !analyst) return null;
    return canonicaliseTeams(master.instances, analyst.instances, tolerance);
  }, [master, analyst, tolerance]);

  const result = useMemo(() => {
    if (!canonical) return null;
    const m = canonical.master.filter(inRange);
    const a = canonical.analyst.filter(inRange);
    return compareInstances(m, a, tolerance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical, tolerance, effectiveRange]);

  const scopedResult = useMemo(() => {
    if (!canonical) return null;
    const matchTeam = (i: Instance) =>
      teamFilter === "all" || i.team === teamFilter;
    const matchCat = (i: Instance) =>
      categoryFilter === "all" || i.category === categoryFilter;
    const m = canonical.master.filter(
      (i) => inRange(i) && matchTeam(i) && matchCat(i)
    );
    const a = canonical.analyst.filter(
      (i) => inRange(i) && matchTeam(i) && matchCat(i)
    );
    return compareInstances(m, a, tolerance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical, tolerance, effectiveRange, teamFilter, categoryFilter]);

  const insights = useMemo(
    () => (scopedResult ? generateInsights(scopedResult) : []),
    [scopedResult]
  );
  const recommendations = useMemo(
    () => (scopedResult ? generateRecommendations(scopedResult) : []),
    [scopedResult]
  );

  const rowTeam = (r: ComparisonRow) =>
    r.master?.team ?? r.analyst?.team ?? "Unknown";
  const rowCategory = (r: ComparisonRow) =>
    r.master?.category ?? r.analyst?.category ?? "Uncategorised";

  const teamScopedRows: ComparisonRow[] = useMemo(() => {
    if (!result) return [];
    return result.rows.filter(
      (r) =>
        (teamFilter === "all" || rowTeam(r) === teamFilter) &&
        (categoryFilter === "all" || rowCategory(r) === categoryFilter)
    );
  }, [result, teamFilter, categoryFilter]);

  const filteredRows: ComparisonRow[] = useMemo(() => {
    if (statusFilter === "all") return teamScopedRows;
    return teamScopedRows.filter((r) => r.status === statusFilter);
  }, [teamScopedRows, statusFilter]);

  const scopedStatBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; exact: number }>();
    for (const r of teamScopedRows) {
      if (!r.master) continue;
      const stat = r.master.stat || "Uncategorised";
      const e = map.get(stat) ?? { total: 0, exact: 0 };
      e.total += 1;
      if (r.status === "exact") e.exact += 1;
      map.set(stat, e);
    }
    return Array.from(map.entries())
      .map(([stat, v]) => ({
        stat,
        total: v.total,
        exact: v.exact,
        accuracy: v.total > 0 ? v.exact / v.total : 0,
      }))
      .sort((a, b) => a.stat.localeCompare(b.stat));
  }, [teamScopedRows]);

  const scopedTotals = useMemo(() => {
    const total = scopedStatBreakdown.reduce((a, s) => a + s.total, 0);
    const exact = scopedStatBreakdown.reduce((a, s) => a + s.exact, 0);
    return { total, exact, accuracy: total > 0 ? exact / total : 0 };
  }, [scopedStatBreakdown]);

  // Per-player disposals & marks table. Master is the gold standard; players
  // that only appear in the analyst are added but flagged as incorrect.
  // Respects the active time-range + team + category filters.
  const playerTable = useMemo(() => {
    if (!canonical) return [];

    const inScope = (i: Instance) =>
      inRange(i) && (teamFilter === "all" || i.team === teamFilter);

    const empty = () => ({
      effKick: 0,
      ineffKick: 0,
      effHb: 0,
      ineffHb: 0,
      marks: 0,
    });
    type Counts = ReturnType<typeof empty>;

    const bump = (c: Counts, statRaw: string) => {
      const s = statRaw.toLowerCase();
      const isKick = s.includes("kick");
      const isHb = s.includes("handball");
      const isEff = s.includes("effective") && !s.includes("ineffective");
      const isIneff = s.includes("ineffective");
      if (isKick && isEff) c.effKick += 1;
      else if (isKick && isIneff) c.ineffKick += 1;
      else if (isHb && isEff) c.effHb += 1;
      else if (isHb && isIneff) c.ineffHb += 1;
      else if (
        s.includes("mark") &&
        (s.includes("contested") || s.includes("uncontested"))
      )
        c.marks += 1; // only contested + uncontested marks
    };

    // key = "team|number"; keep display name + which side(s) it appears in.
    const rows = new Map<
      string,
      {
        team: string;
        number: number | null;
        master: Counts;
        analyst: Counts;
        inMaster: boolean;
        inAnalyst: boolean;
      }
    >();

    const ensure = (i: Instance) => {
      const key = `${i.team.toLowerCase()}|${i.playerNumber ?? "?"}`;
      let r = rows.get(key);
      if (!r) {
        r = {
          team: i.team,
          number: i.playerNumber,
          master: empty(),
          analyst: empty(),
          inMaster: false,
          inAnalyst: false,
        };
        rows.set(key, r);
      }
      return r;
    };

    for (const i of canonical.master) {
      if (!inScope(i)) continue;
      const r = ensure(i);
      r.inMaster = true;
      bump(r.master, i.stat);
    }
    for (const i of canonical.analyst) {
      if (!inScope(i)) continue;
      const r = ensure(i);
      r.inAnalyst = true;
      bump(r.analyst, i.stat);
    }

    const derive = (c: Counts) => ({
      ...c,
      totalKicks: c.effKick + c.ineffKick,
      totalHb: c.effHb + c.ineffHb,
      disposals: c.effKick + c.ineffKick + c.effHb + c.ineffHb,
    });

    return Array.from(rows.values())
      .map((r) => ({
        key: `${r.team} - #${r.number ?? "?"}`,
        team: r.team,
        number: r.number,
        master: derive(r.master),
        analyst: derive(r.analyst),
        // A player only in the analyst (not in master) is incorrect.
        analystOnly: r.inAnalyst && !r.inMaster,
      }))
      // Drop players with no disposals/marks on either side (e.g. only had
      // tackles or stoppages — not relevant to this table).
      .filter(
        (r) =>
          r.master.disposals + r.master.marks + r.analyst.disposals + r.analyst.marks >
          0
      )
      .sort((a, b) => {
        // Master players first, then by team, then by number.
        if (a.analystOnly !== b.analystOnly) return a.analystOnly ? 1 : -1;
        if (a.team !== b.team) return a.team.localeCompare(b.team);
        return (a.number ?? 999) - (b.number ?? 999);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical, effectiveRange, teamFilter]);

  // Real comparison teams have master instances and a proper name. Teams with
  // no master instances (analyst-only extras from a name mismatch, or an
  // analyst that only coded one team) or "Unknown" are surfaced separately.
  const realTeams = useMemo(
    () =>
      (result?.byTeam ?? []).filter(
        (t) => t.masterTotal > 0 && t.team.toLowerCase() !== "unknown"
      ),
    [result]
  );
  const unmatchedTeams = useMemo(
    () =>
      (result?.byTeam ?? []).filter(
        (t) => t.masterTotal === 0 || t.team.toLowerCase() === "unknown"
      ),
    [result]
  );
  const unmatchedExtra = useMemo(
    () => unmatchedTeams.reduce((a, t) => a + t.extra, 0),
    [unmatchedTeams]
  );

  function swap() {
    const m = master;
    setMaster(analyst);
    setAnalyst(m);
    // Keep allocations aligned with the files they describe.
    const ma = masterAnalyst;
    setMasterAnalyst(gradedAnalyst);
    setGradedAnalyst(ma);
  }

  async function handleSaveCheck() {
    if (!result) return;

    if (!gradedAnalyst) {
      setSaveMsg("Select the analyst being graded first.");
      return;
    }

    try {
      setSaving(true);
      setSaveMsg(null);

      await saveAccuracyCheck({
        analystName: gradedAnalyst,
        masterAnalystName: masterAnalyst || null,
        matchLabel: matchLabel || null,
        fileNameMaster: master?.name ?? null,
        fileNameAnalyst: analyst?.name ?? null,
        tolerance,
        // Save the full-window result (not the team/category-scoped one)
        // so the stored summary reflects the whole check.
        result,
      });

      setSaveMsg(
        `Saved to ${gradedAnalyst}'s profile` +
          (masterAnalyst ? ` (master by ${masterAnalyst})` : "") +
          "."
      );
    } catch (err) {
      console.error(err);
      setSaveMsg(
        err instanceof Error ? err.message : "Failed to save accuracy check."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl p-6 lg:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Accuracy Comparison
            </h1>
            <div className={`mt-3 h-1 w-12 rounded-full ${ACCENT_BG}`} />
            <p className="mt-3 max-w-2xl text-sm text-slate-600">
              Upload a master XML and an analyst XML to grade accuracy.
              Instances are matched by timestamp (within the tolerance), then
              compared on team, player number and stat.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Home
          </Link>
        </div>

        {/* Upload row */}
        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr]">
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Master{" "}
              <span className="font-normal text-slate-400">
                (correct reference)
              </span>
            </p>
            <Dropzone
              title="Upload master XML"
              subtitle="Drag & drop or click"
              file={master}
              onLoad={setMaster}
              onClear={() => setMaster(null)}
            />
            <div className="mt-2">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Coded by (master)
              </label>
              <select
                value={masterAnalyst}
                onChange={(e) => setMasterAnalyst(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
              >
                <option value="">Select analyst...</option>
                {analystNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-end justify-center pb-6">
            <button
              onClick={swap}
              disabled={!master && !analyst}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
              title="Swap master and analyst"
            >
              <ArrowRightLeft size={14} /> Swap
            </button>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Analyst{" "}
              <span className="font-normal text-slate-400">(being graded)</span>
            </p>
            <Dropzone
              title="Upload analyst XML"
              subtitle="Drag & drop or click"
              file={analyst}
              onLoad={setAnalyst}
              onClear={() => setAnalyst(null)}
            />
            <div className="mt-2">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Coded by (analyst being graded)
              </label>
              <select
                value={gradedAnalyst}
                onChange={(e) => setGradedAnalyst(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
              >
                <option value="">Select analyst...</option>
                {analystNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Tolerance control */}
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-sm font-semibold text-slate-700">
            Timestamp tolerance
          </span>
          <div className="flex gap-1">
            {[2, 3, 5].map((t) => (
              <button
                key={t}
                onClick={() => setTolerance(t)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  tolerance === t
                    ? `${ACCENT_BG} text-white`
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                ±{t}s
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500">
            Events within this window are matched; the stat still has to agree
            to count as exact.
          </span>
        </div>

        {/* Time range control */}
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Clock size={15} /> Time range
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setRangeMode("auto")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  rangeMode === "auto"
                    ? `${ACCENT_BG} text-white`
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Overlapping section
              </button>
              <button
                onClick={() => setRangeMode("manual")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  rangeMode === "manual"
                    ? `${ACCENT_BG} text-white`
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Custom
              </button>
              <button
                onClick={() => setRangeMode("full")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  rangeMode === "full"
                    ? `${ACCENT_BG} text-white`
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Full game
              </button>
            </div>

            {rangeMode === "manual" && (
              <div className="flex items-center gap-2">
                <input
                  value={manualStart}
                  onChange={(e) => setManualStart(e.target.value)}
                  placeholder={
                    analystWindow ? analystWindow.start.toFixed(2) : "e.g. 2082"
                  }
                  className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-red-500"
                />
                <span className="text-slate-400">to</span>
                <input
                  value={manualEnd}
                  onChange={(e) => setManualEnd(e.target.value)}
                  placeholder={
                    analystWindow ? analystWindow.end.toFixed(2) : "e.g. 3976"
                  }
                  className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-red-500"
                />
                <span className="text-xs text-slate-400">seconds</span>
              </div>
            )}
          </div>

          <p className="mt-2.5 text-xs text-slate-500">
            {rangeMode === "auto" && analystWindow && (
              <>
                Comparing only the section covered by the smaller file
                {analystWindow.source ? ` (${analystWindow.source})` : ""}:{" "}
                <span className="font-semibold text-slate-700">
                  {analystWindow.start.toFixed(2)} –{" "}
                  {analystWindow.end.toFixed(2)}s
                </span>{" "}
                ({formatTime(analystWindow.start)} –{" "}
                {formatTime(analystWindow.end)}). Instances outside this window
                are ignored so a partial file isn&apos;t penalised.
              </>
            )}
            {rangeMode === "full" &&
              "Comparing the entire game. A partial analyst file will show many missed events."}
            {rangeMode === "manual" &&
              "Enter start and end in seconds (matching the XML, e.g. 2082 – 3976). Leave a box blank for open-ended."}
          </p>

          {result && master && analyst && (
            <p className="mt-1 text-xs text-slate-500">
              In window:{" "}
              <span className="font-semibold text-slate-700">
                {master.instances.filter(inRange).length}
              </span>{" "}
              master ·{" "}
              <span className="font-semibold text-slate-700">
                {analyst.instances.filter(inRange).length}
              </span>{" "}
              analyst instances
              {rangeMode !== "full" && (
                <>
                  {" "}
                  (of {master.instances.length} / {analyst.instances.length}{" "}
                  total)
                </>
              )}
            </p>
          )}
        </div>

        {!result && (
          <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <Target className="mb-3 text-slate-300" size={40} />
            <p className="text-sm font-medium text-slate-500">
              Upload both files to see the comparison.
            </p>
          </div>
        )}

        {result && (
          <>
            {/* Settings summary */}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600 shadow-sm">
              <span>
                <span className="text-slate-400">Master:</span>{" "}
                <span className="font-semibold text-slate-800">
                  {master?.name}
                </span>
              </span>
              <span>
                <span className="text-slate-400">Analyst:</span>{" "}
                <span className="font-semibold text-slate-800">
                  {analyst?.name}
                </span>
              </span>
              <span>
                <span className="text-slate-400">Tolerance:</span>{" "}
                <span className="font-semibold text-slate-800">
                  ±{tolerance}s
                </span>
              </span>
              <span>
                <span className="text-slate-400">Range:</span>{" "}
                <span className="font-semibold text-slate-800">
                  {rangeMode === "auto"
                    ? "Overlapping section"
                    : rangeMode === "manual"
                      ? "Custom"
                      : "Full game"}
                  {effectiveRange.start > -Infinity ||
                  effectiveRange.end < Infinity
                    ? ` · ${
                        effectiveRange.start > -Infinity
                          ? effectiveRange.start.toFixed(0)
                          : "start"
                      }–${
                        effectiveRange.end < Infinity
                          ? effectiveRange.end.toFixed(0)
                          : "end"
                      }s`
                    : ""}
                </span>
              </span>
              <span>
                <span className="text-slate-400">In window:</span>{" "}
                <span className="font-semibold text-slate-800">
                  {master?.instances.filter(inRange).length} master /{" "}
                  {analyst?.instances.filter(inRange).length} analyst
                </span>
              </span>
            </div>

            {/* Save allocation bar */}
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-700">
                Save this check
              </div>
              <input
                type="text"
                value={matchLabel}
                onChange={(e) => setMatchLabel(e.target.value)}
                placeholder="Match label (e.g. Round 20 — Home v Away)"
                className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
              />
              <div className="text-xs text-slate-500">
                Graded:{" "}
                <span className="font-semibold text-slate-700">
                  {gradedAnalyst || "— select above —"}
                </span>
                {masterAnalyst && (
                  <>
                    {"  ·  Master: "}
                    <span className="font-semibold text-slate-700">
                      {masterAnalyst}
                    </span>
                  </>
                )}
              </div>
              <button
                onClick={handleSaveCheck}
                disabled={saving || !gradedAnalyst}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${ACCENT_BG} hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-300`}
              >
                <Save size={14} />
                {saving ? "Saving..." : "Save accuracy check"}
              </button>
              {saveMsg && (
                <span className="text-xs font-medium text-slate-600">
                  {saveMsg}
                </span>
              )}
            </div>

            {/* Summary cards */}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
              <StatCard
                label="Accuracy"
                value={`${(result.summary.accuracy * 100).toFixed(1)}%`}
                accent={
                  result.summary.accuracy >= 0.9
                    ? "text-emerald-600"
                    : result.summary.accuracy >= 0.75
                      ? "text-amber-600"
                      : "text-red-600"
                }
                sub={`${result.summary.exact}/${result.summary.masterTotal} exact`}
              />
              <StatCard label="Exact" value={`${result.summary.exact}`} accent="text-emerald-600" />
              <StatCard label="Wrong stat" value={`${result.summary.wrongStat}`} accent="text-amber-600" />
              <StatCard label="Wrong player" value={`${result.summary.wrongPlayer}`} accent="text-orange-600" />
              <StatCard label="Wrong team" value={`${result.summary.wrongTeam}`} accent="text-red-600" />
              <StatCard label="Missed" value={`${result.summary.missed}`} accent="text-slate-600" />
              <StatCard label="Extra" value={`${result.summary.extra}`} accent="text-purple-600" />
            </div>

            {/* Category breakdown */}
            {result.byCategory.length > 0 && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-700">
                    Accuracy by stat category
                  </h2>
                  {categoryFilter !== "all" && (
                    <button
                      onClick={() => setCategoryFilter("all")}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                    >
                      <X size={12} /> Clear filter
                    </button>
                  )}
                </div>
                <p className="mb-3 text-xs text-slate-400">
                  Click a category to filter the breakdown table and timeline.
                </p>
                <div className="space-y-1">
                  {result.byCategory.map((c) => {
                    const active = categoryFilter === c.category;
                    return (
                      <button
                        key={c.category}
                        onClick={() =>
                          setCategoryFilter(active ? "all" : c.category)
                        }
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition ${
                          active
                            ? "bg-red-50 ring-1 ring-red-200"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className={`w-32 shrink-0 truncate text-sm ${
                            active
                              ? `font-semibold ${ACCENT_TEXT}`
                              : "text-slate-600"
                          }`}
                        >
                          {c.category}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${
                              c.accuracy >= 0.9
                                ? "bg-emerald-500"
                                : c.accuracy >= 0.75
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                            }`}
                            style={{ width: `${c.accuracy * 100}%` }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right text-xs text-slate-500">
                          {(c.accuracy * 100).toFixed(0)}% ({c.exact}/{c.total})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Per-stat breakdown table */}
            {result.byStat.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
                  <h2 className="text-sm font-semibold text-slate-700">
                    Statistic breakdown
                    {categoryFilter !== "all" && (
                      <span className="ml-2 rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                        {categoryFilter}
                      </span>
                    )}
                  </h2>
                  <button
                    onClick={() => exportStatCsv(scopedStatBreakdown)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <Download size={13} /> Export CSV
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-2.5">Statistic Type</th>
                        <th className="px-4 py-2.5 text-right">Master</th>
                        <th className="px-4 py-2.5 text-right">Exact</th>
                        <th className="px-4 py-2.5 text-right">Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scopedStatBreakdown.map((s) => (
                        <tr
                          key={s.stat}
                          className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60"
                        >
                          <td className="px-4 py-2 font-medium text-slate-800">
                            {s.stat}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                            {s.total}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                            {s.exact}
                          </td>
                          <td
                            className={`px-4 py-2 text-right tabular-nums font-semibold ${
                              s.accuracy >= 0.9
                                ? "text-emerald-600"
                                : s.accuracy >= 0.75
                                  ? "text-amber-600"
                                  : "text-red-600"
                            }`}
                          >
                            {(s.accuracy * 100).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                      {scopedStatBreakdown.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-6 text-center text-sm text-slate-400"
                          >
                            No stats for this filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="sticky bottom-0">
                      <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
                        <td className="px-4 py-2.5">Totals</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {scopedTotals.total}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {scopedTotals.exact}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {(scopedTotals.accuracy * 100).toFixed(0)}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Per-player disposals & marks table */}
            {playerTable.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
                  <h2 className="text-sm font-semibold text-slate-700">
                    Player disposals &amp; marks{" "}
                    <span className="font-normal text-slate-400">
                      {teamFilter === "all" ? "· Both teams" : `· ${teamFilter}`}{" "}
                      (Master / Analyst)
                    </span>
                  </h2>
                  <button
                    onClick={() => exportPlayerCsv(playerTable)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <Download size={13} /> Export CSV
                  </button>
                </div>
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <th
                          rowSpan={2}
                          className="border-b border-slate-200 px-4 py-2 text-left"
                        >
                          Player
                        </th>
                        {PLAYER_COLS.map((col) => (
                          <th
                            key={col.key}
                            colSpan={2}
                            className="border-b border-l border-slate-200 px-3 py-1.5 text-center"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {PLAYER_COLS.map((col) => (
                          <FragmentSubHead key={col.key} />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {playerTable.map((p) => (
                        <tr
                          key={p.key}
                          className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 ${
                            p.analystOnly ? "bg-red-50/60" : ""
                          }`}
                        >
                          <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-800">
                            {p.key}
                            {p.analystOnly && (
                              <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                                analyst only
                              </span>
                            )}
                          </td>
                          {PLAYER_COLS.map((col) => {
                            const m = col.get(p.master);
                            const a = col.get(p.analyst);
                            const mismatch = m !== a;
                            return (
                              <PlayerCells
                                key={col.key}
                                master={m}
                                analyst={a}
                                mismatch={mismatch}
                              />
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-10">
                      <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
                        <td className="whitespace-nowrap px-4 py-2.5 text-left">
                          Team totals
                        </td>
                        {PLAYER_COLS.map((col) => {
                          const mTot = playerTable.reduce(
                            (sum, p) => sum + col.get(p.master),
                            0
                          );
                          const aTot = playerTable.reduce(
                            (sum, p) => sum + col.get(p.analyst),
                            0
                          );
                          const mismatch = mTot !== aTot;
                          return (
                            <PlayerCells
                              key={col.key}
                              master={mTot}
                              analyst={aTot}
                              mismatch={mismatch}
                            />
                          );
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400">
                  Total Disposals = eff + ineff kicks &amp; handballs. Marks =
                  contested + uncontested only. Analyst counts shown in red
                  differ from the master.
                </p>
              </div>
            )}

            {/* Per-team breakdown */}
            {realTeams.length > 0 && (
              <div className="mt-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">
                  Accuracy by team
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {realTeams.map((t) => (
                    <TeamCard key={t.team} team={t} />
                  ))}
                </div>
              </div>
            )}

            {/* Unmatched teams warning (name mismatch or one-team analyst) */}
            {unmatchedExtra > 0 && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
                <AlertTriangle
                  size={17}
                  className="mt-0.5 shrink-0 text-amber-500"
                />
                <p>
                  <span className="font-semibold">{unmatchedExtra}</span> analyst
                  instance{unmatchedExtra === 1 ? "" : "s"} couldn&apos;t be
                  matched to any master team
                  {unmatchedTeams.some(
                    (t) => t.team.toLowerCase() !== "unknown"
                  ) && (
                    <>
                      {" "}
                      (
                      {unmatchedTeams
                        .filter((t) => t.team.toLowerCase() !== "unknown")
                        .map((t) => `"${t.team}"`)
                        .join(", ")}
                      )
                    </>
                  )}
                  . Either the analyst coded only one team, or the team names
                  differ between the master and analyst files.
                </p>
              </div>
            )}

            {/* AI insights */}
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Sparkles size={18} className={ACCENT_TEXT} />
                  <h2 className="text-sm font-semibold text-slate-700">
                    AI insights
                  </h2>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {teamFilter === "all" ? "Both teams" : teamFilter}
                    {categoryFilter !== "all" ? ` · ${categoryFilter}` : ""}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {insights.map((ins, i) => {
                    const meta = TONE_META[ins.tone];
                    const Icon = meta.icon;
                    return (
                      <div
                        key={i}
                        className={`flex gap-3 rounded-xl border p-3 ${meta.ring}`}
                      >
                        <Icon
                          size={18}
                          className={`mt-0.5 shrink-0 ${meta.ic1}`}
                        />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {ins.title}
                          </p>
                          <p className="text-xs text-slate-600">{ins.detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Lightbulb size={18} className={ACCENT_TEXT} />
                  <h2 className="text-sm font-semibold text-slate-700">
                    Recommendations
                  </h2>
                </div>
                <ul className="space-y-2">
                  {recommendations.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-600">
                      <span
                        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${ACCENT_BG}`}
                      />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Team filter */}
            {realTeams.length >= 1 && (
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Team
                </span>
                <button
                  onClick={() => setTeamFilter("all")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    teamFilter === "all"
                      ? `${NAVY_BG} text-white`
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Both teams
                </button>
                {realTeams.map((t) => (
                  <button
                    key={t.team}
                    onClick={() => setTeamFilter(t.team)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      teamFilter === t.team
                        ? `${NAVY_BG} text-white`
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {t.team}
                  </button>
                ))}
              </div>
            )}

            {/* Status filter */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setStatusFilter("all")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All ({teamScopedRows.length})
              </button>
              {(Object.keys(STATUS_META) as MatchStatus[]).map((s) => {
                const n = teamScopedRows.filter((r) => r.status === s).length;
                if (n === 0) return null;
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      statusFilter === s
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`}
                    />
                    {STATUS_META[s].label} ({n})
                  </button>
                );
              })}
            </div>

            {/* Synced side-by-side timeline */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[110px_1fr_1fr] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <div className="p-3">Status</div>
                <div className="border-l border-slate-200 p-3">
                  Master {master ? `· ${master.name}` : ""}
                </div>
                <div className="border-l border-slate-200 p-3">
                  Analyst {analyst ? `· ${analyst.name}` : ""}
                </div>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {filteredRows.map((row, i) => {
                  const meta = STATUS_META[row.status];
                  return (
                    <div
                      key={i}
                      className="grid grid-cols-[110px_1fr_1fr] border-b border-slate-100 text-sm last:border-b-0 hover:bg-slate-50/60"
                    >
                      <div className="flex items-center p-3">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <TimelineCell instance={row.master} />
                      <TimelineCell
                        instance={row.analyst}
                        delta={row.timeDelta}
                      />
                    </div>
                  );
                })}
                {filteredRows.length === 0 && (
                  <div className="p-8 text-center text-sm text-slate-400">
                    No rows for this filter.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TimelineCell({
  instance,
  delta,
}: {
  instance: Instance | null;
  delta?: number | null;
}) {
  if (!instance) {
    return (
      <div className="border-l border-slate-200 p-3">
        <span className="text-xs italic text-slate-300">— no entry —</span>
      </div>
    );
  }
  return (
    <div className="border-l border-slate-200 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-xs font-semibold text-slate-500">
          {formatTime(instance.start)}
        </span>
        {delta != null && delta > 0 && (
          <span className="text-[10px] text-slate-400">
            (+{delta.toFixed(1)}s)
          </span>
        )}
        <span className="text-sm font-semibold text-slate-900">
          {instance.stat || instance.category || "—"}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        {instance.team}
        {instance.playerNumber != null && (
          <span className="font-medium text-slate-700">
            {" "}
            · #{instance.playerNumber}
          </span>
        )}
      </p>
    </div>
  );
}
