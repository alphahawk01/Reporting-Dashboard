"use client";

import { useMemo, useState, useEffect, useRef } from "react";
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
  Video,
  X as XIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  saveAccuracyCheck,
  getAccuracyCheckById,
  getSavedMasters,
  type SavedMaster,
} from "@/lib/api/accuracyChecks";
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

type LoadedFile = { name: string; instances: Instance[]; raw: string };

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
      onLoad({ name: f.name, instances, raw: text });
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

// ------------------------------------------------------------------
// SPORTS
// ------------------------------------------------------------------
// The per-player stats table is sport-specific. Each sport defines:
//   - init():   the zeroed counts object
//   - bump():   classify a stat label into the counts
//   - derive(): compute any totals from the raw counts
//   - columns:  which counts to show (label + accessor)
//   - relevant(): whether a player row has any data worth showing
// This keeps the table generic so new sports just add a config entry.

type Sport = "afl" | "football";

// A counts object is an open string->number map so each sport can use
// its own keys.
type PlayerCounts = Record<string, number>;

type PlayerRow = {
  key: string;
  team: string;
  number: number | null;
  master: PlayerCounts;
  analyst: PlayerCounts;
  analystOnly: boolean;
};

type PlayerCol = {
  key: string;
  label: string;
  get: (c: PlayerCounts) => number;
};

type SportConfig = {
  id: Sport;
  label: string;
  init: () => PlayerCounts;
  bump: (c: PlayerCounts, statLower: string) => void;
  derive: (c: PlayerCounts) => PlayerCounts;
  columns: PlayerCol[];
  relevant: (master: PlayerCounts, analyst: PlayerCounts) => boolean;
  csvName: string;
};

// ---- Aussie Rules ------------------------------------------------
const AFL_CONFIG: SportConfig = {
  id: "afl",
  label: "Aussie Rules",
  init: () => ({ effKick: 0, ineffKick: 0, effHb: 0, ineffHb: 0, marks: 0 }),
  bump: (c, s) => {
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
      c.marks += 1;
  },
  derive: (c) => ({
    ...c,
    totalKicks: c.effKick + c.ineffKick,
    totalHb: c.effHb + c.ineffHb,
    disposals: c.effKick + c.ineffKick + c.effHb + c.ineffHb,
  }),
  columns: [
    { key: "disposals", label: "Total Disposals", get: (c) => c.disposals },
    { key: "effKick", label: "Eff Kicks", get: (c) => c.effKick },
    { key: "ineffKick", label: "Ineff Kicks", get: (c) => c.ineffKick },
    { key: "totalKicks", label: "Total Kicks", get: (c) => c.totalKicks },
    { key: "effHb", label: "Eff Handballs", get: (c) => c.effHb },
    { key: "ineffHb", label: "Ineff Handballs", get: (c) => c.ineffHb },
    { key: "totalHb", label: "Total Handballs", get: (c) => c.totalHb },
    { key: "marks", label: "Marks", get: (c) => c.marks },
  ],
  relevant: (m, a) =>
    m.disposals + m.marks + a.disposals + a.marks > 0,
  csvName: "player-disposals-marks.csv",
};

// ---- Football (Soccer) -------------------------------------------
// Stat keywords match the actual labels used in the football XML, e.g.
// "Short Passes Successful", "Crosses Unsuccesful" (note the source's
// misspelling), "Ground Duels Won", "Shots Off Target", etc.
const FOOTBALL_CONFIG: SportConfig = {
  id: "football",
  label: "Football",
  init: () => ({
    shortPassSucc: 0,
    shortPassUnsucc: 0,
    longPassSucc: 0,
    longPassUnsucc: 0,
    throughSucc: 0,
    throughUnsucc: 0,
    crossSucc: 0,
    crossUnsucc: 0,
    touches: 0,
    carries: 0,
    shots: 0,
    goals: 0,
    tacklesSucc: 0,
    tacklesUnsucc: 0,
    dribblesSucc: 0,
    dribblesUnsucc: 0,
    interceptions: 0,
    clearances: 0,
    ballRecoveries: 0,
    groundDuelsWon: 0,
    groundDuelsLost: 0,
    aerialWon: 0,
    aerialLost: 0,
    headers: 0,
    fouls: 0,
    foulsDrawn: 0,
  }),
  bump: (c, s) => {
    // Shots & goals first (before generic pass/cross checks).
    if (s.includes("goal") && !s.includes("goal kick")) c.goals += 1;
    else if (s.includes("shot")) c.shots += 1; // off target / saved / free kick shots
    // Passing
    else if (s.includes("short pass") && s.includes("unsuccessful"))
      c.shortPassUnsucc += 1;
    else if (s.includes("short pass") && s.includes("successful"))
      c.shortPassSucc += 1;
    else if (s.includes("long pass") && s.includes("unsuccessful"))
      c.longPassUnsucc += 1;
    else if (s.includes("long pass") && s.includes("successful"))
      c.longPassSucc += 1;
    else if (s.includes("through ball") && s.includes("unsuccessful"))
      c.throughUnsucc += 1;
    else if (s.includes("through ball") && s.includes("successful"))
      c.throughSucc += 1;
    // Crosses — source misspells "Unsuccesful" (one 's'), so match both.
    else if (
      s.includes("cross") &&
      (s.includes("unsuccessful") || s.includes("unsuccesful"))
    )
      c.crossUnsucc += 1;
    else if (s.includes("cross") && s.includes("successful"))
      c.crossSucc += 1;
    // On-ball
    else if (s.includes("touch")) c.touches += 1;
    else if (s.includes("carr")) c.carries += 1; // Carries
    // Defensive / duels
    else if (s.includes("tackle") && s.includes("unsuccessful"))
      c.tacklesUnsucc += 1;
    else if (s.includes("tackle") && s.includes("successful"))
      c.tacklesSucc += 1;
    else if (s.includes("dribble") && s.includes("unsuccessful"))
      c.dribblesUnsucc += 1;
    else if (s.includes("dribble") && s.includes("successful"))
      c.dribblesSucc += 1;
    else if (s.includes("intercept")) c.interceptions += 1;
    else if (s.includes("clearance")) c.clearances += 1;
    else if (s.includes("ball recover")) c.ballRecoveries += 1;
    else if (s.includes("ground duels won")) c.groundDuelsWon += 1;
    else if (s.includes("ground duels lost")) c.groundDuelsLost += 1;
    else if (s.includes("aerial win")) c.aerialWon += 1;
    else if (s.includes("aerial loss")) c.aerialLost += 1;
    else if (s.includes("header")) c.headers += 1;
    else if (s.includes("fouls drawn")) c.foulsDrawn += 1;
    else if (s.includes("foul")) c.fouls += 1;
  },
  derive: (c) => ({
    ...c,
    passSucc: c.shortPassSucc + c.longPassSucc + c.throughSucc,
    passUnsucc: c.shortPassUnsucc + c.longPassUnsucc + c.throughUnsucc,
    totalPasses:
      c.shortPassSucc +
      c.longPassSucc +
      c.throughSucc +
      c.shortPassUnsucc +
      c.longPassUnsucc +
      c.throughUnsucc,
    crosses: c.crossSucc + c.crossUnsucc,
    tackles: c.tacklesSucc + c.tacklesUnsucc,
  }),
  columns: [
    { key: "touches", label: "Touches", get: (c) => c.touches },
    { key: "totalPasses", label: "Passes", get: (c) => c.totalPasses },
    { key: "passSucc", label: "Pass Succ", get: (c) => c.passSucc },
    { key: "passUnsucc", label: "Pass Unsucc", get: (c) => c.passUnsucc },
    { key: "carries", label: "Carries", get: (c) => c.carries },
    { key: "crosses", label: "Crosses", get: (c) => c.crosses },
    { key: "shots", label: "Shots", get: (c) => c.shots },
    { key: "goals", label: "Goals", get: (c) => c.goals },
    { key: "tackles", label: "Tackles", get: (c) => c.tackles },
    {
      key: "interceptions",
      label: "Intercepts",
      get: (c) => c.interceptions,
    },
    { key: "clearances", label: "Clearances", get: (c) => c.clearances },
    {
      key: "ballRecoveries",
      label: "Ball Recov",
      get: (c) => c.ballRecoveries,
    },
    {
      key: "dribblesSucc",
      label: "Dribbles",
      get: (c) => c.dribblesSucc + c.dribblesUnsucc,
    },
    { key: "headers", label: "Headers", get: (c) => c.headers },
    { key: "fouls", label: "Fouls", get: (c) => c.fouls },
  ],
  relevant: (m, a) => {
    const sum = (c: PlayerCounts) =>
      c.touches +
      c.totalPasses +
      c.carries +
      c.crosses +
      c.shots +
      c.goals +
      c.tackles +
      c.interceptions +
      c.clearances +
      c.ballRecoveries +
      c.dribblesSucc +
      c.dribblesUnsucc +
      c.headers +
      c.fouls;
    return sum(m) + sum(a) > 0;
  },
  csvName: "player-football-stats.csv",
};

const SPORT_CONFIGS: Record<Sport, SportConfig> = {
  afl: AFL_CONFIG,
  football: FOOTBALL_CONFIG,
};

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

function exportPlayerCsv(rows: PlayerRow[], cols: PlayerCol[], fileName: string) {
  const head = ["Player"];
  for (const col of cols) head.push(`${col.label} (M)`, `${col.label} (A)`);
  head.push("Analyst only");
  const lines = rows.map((p) => {
    const cells: string[] = [JSON.stringify(p.key)];
    for (const col of cols)
      cells.push(String(col.get(p.master)), String(col.get(p.analyst)));
    cells.push(p.analystOnly ? "yes" : "");
    return cells.join(",");
  });
  const csv = [head.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
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
  const [statFilter, setStatFilter] = useState<string | "all">("all");

  const [rangeMode, setRangeMode] = useState<"auto" | "full" | "manual">(
    "auto"
  );
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");

  // Active sport — drives which per-player stats table is shown.
  const [sport, setSport] = useState<Sport>("afl");
  const sportConfig = SPORT_CONFIGS[sport];

  // Video review: paste a URL, open a player, click any stat to seek.
  const [videoUrl, setVideoUrl] = useState("");
  const [videoOpen, setVideoOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Current playback position (seconds), used to highlight the stat(s)
  // whose [start, end] window is on screen right now.
  const [videoTime, setVideoTime] = useState(0);

  // Ref to the currently-active timeline row so we can keep it in view
  // as the video plays.
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [videoTime]);

  // Seek the (open) video to a given second. Clicking a timeline row
  // jumps to the instance's START time (the lead-in of the coded
  // window) so you see the build-up to the action. If the player isn't
  // mounted yet (first click opens it), retry briefly until the <video>
  // element exists.
  const seekVideo = (seconds: number) => {
    setVideoOpen(true);
    const target = Math.max(0, seconds);
    let attempts = 0;
    const trySeek = () => {
      const v = videoRef.current;
      if (v) {
        v.currentTime = target;
        v.play().catch(() => {});
        return;
      }
      if (attempts++ < 30) requestAnimationFrame(trySeek);
    };
    requestAnimationFrame(trySeek);
  };

  // Previously-saved master XMLs, for the "reuse master" dropdown.
  const [savedMasters, setSavedMasters] = useState<SavedMaster[]>([]);

  // Analyst allocation + save
  const [analystNames, setAnalystNames] = useState<string[]>([]);
  const [masterAnalyst, setMasterAnalyst] = useState("");
  const [gradedAnalyst, setGradedAnalyst] = useState("");
  const [matchLabel, setMatchLabel] = useState("");
  // Whether the user has typed their own label. Until they do, the
  // label auto-defaults to AnalystName_AnalystFilename.
  const [labelEdited, setLabelEdited] = useState(false);
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

  // Load previously-saved master XMLs for the reuse dropdown.
  useEffect(() => {
    let cancelled = false;
    getSavedMasters().then((m) => {
      if (!cancelled) setSavedMasters(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-open a saved check: if the URL has ?check=<id>, load that check
  // from Supabase, parse its stored XML back into master/analyst, and
  // restore the allocation/label so the full comparison is rebuilt.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkId = params.get("check");
    if (!checkId) return;

    let cancelled = false;

    (async () => {
      const check = await getAccuracyCheckById(Number(checkId));
      if (!check || cancelled) return;

      if (check.xml_master) {
        const instances = parseInstances(check.xml_master);
        setMaster({
          name: check.file_name_master ?? "master.xml",
          instances,
          raw: check.xml_master,
        });
      }
      if (check.xml_analyst) {
        const instances = parseInstances(check.xml_analyst);
        setAnalyst({
          name: check.file_name_analyst ?? "analyst.xml",
          instances,
          raw: check.xml_analyst,
        });
      }
      if (check.tolerance != null) setTolerance(check.tolerance);
      if (check.master_analyst_name) setMasterAnalyst(check.master_analyst_name);
      setGradedAnalyst(check.analyst_name);
      if (check.match_label) {
        setMatchLabel(check.match_label);
        setLabelEdited(true);
      }
      if (check.video_url) setVideoUrl(check.video_url);
      if (check.sport === "afl" || check.sport === "football")
        setSport(check.sport);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Default the save label to AnalystName_AnalystFilename (analyst name
  // with spaces stripped + underscore + analyst file name minus .xml),
  // until the user types their own label.
  useEffect(() => {
    if (labelEdited) return;
    if (!gradedAnalyst || !analyst?.name) {
      setMatchLabel("");
      return;
    }
    const analystNoSpaces = gradedAnalyst.replace(/\s+/g, "");
    const fileNoExt = analyst.name.replace(/\.xml$/i, "");
    setMatchLabel(`${analystNoSpaces}_${fileNoExt}`);
  }, [gradedAnalyst, analyst, labelEdited]);

  const analystWindow = useMemo(() => {
    const files = [master, analyst].filter(
      (f): f is LoadedFile => !!f && f.instances.length > 0
    );
    if (files.length === 0) return null;
    const smaller = files.reduce((a, b) =>
      b.instances.length < a.instances.length ? b : a
    );
    const mids = smaller.instances.map((i) => i.mid);
    return {
      start: Math.min(...mids),
      end: Math.max(...mids),
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
    i.mid >= effectiveRange.start && i.mid <= effectiveRange.end;

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

  const rowStat = (r: ComparisonRow) =>
    r.master?.stat ?? r.analyst?.stat ?? "Uncategorised";

  // Team + category scope. Drives the stat breakdown table (so every
  // stat stays listed and clickable, regardless of statFilter).
  const teamScopedRows: ComparisonRow[] = useMemo(() => {
    if (!result) return [];
    return result.rows.filter(
      (r) =>
        (teamFilter === "all" || rowTeam(r) === teamFilter) &&
        (categoryFilter === "all" || rowCategory(r) === categoryFilter)
    );
  }, [result, teamFilter, categoryFilter]);

  // Adds the selected-stat scope on top of team + category. Used for the
  // top summary cards and (with status) the timeline.
  const statScopedRows: ComparisonRow[] = useMemo(() => {
    if (statFilter === "all") return teamScopedRows;
    return teamScopedRows.filter((r) => rowStat(r) === statFilter);
  }, [teamScopedRows, statFilter]);

  const filteredRows: ComparisonRow[] = useMemo(() => {
    if (statusFilter === "all") return statScopedRows;
    return statScopedRows.filter((r) => r.status === statusFilter);
  }, [statScopedRows, statusFilter]);

  // Video review has its own stat filter so it can show every instance of a
  // selected stat without inheriting the page's team/category/stat/status
  // filters. Keep the original comparison rows so missed and extra entries
  // remain available in the review.
  const [videoStatFilter, setVideoStatFilter] = useState<string | "all">("all");
  const videoStatOptions = useMemo(() => {
    if (!result) return [];
    const stats = new Set<string>();
    for (const row of result.rows) {
      if (row.master?.stat.trim()) stats.add(row.master.stat.trim());
      if (row.analyst?.stat.trim()) stats.add(row.analyst.stat.trim());
    }
    return Array.from(stats).sort((a, b) => a.localeCompare(b));
  }, [result]);

  const videoRows: ComparisonRow[] = useMemo(() => {
    if (!result) return [];
    if (videoStatFilter === "all") return result.rows;
    return result.rows.filter(
      (row) =>
        row.master?.stat.trim() === videoStatFilter ||
        row.analyst?.stat.trim() === videoStatFilter
    );
  }, [result, videoStatFilter]);

  // Summary that reflects the active team/category/stat filters (NOT the
  // status filter, so the cards show the full breakdown of the scope).
  const scopedSummary = useMemo(() => {
    const count = (s: MatchStatus) =>
      statScopedRows.filter((r) => r.status === s).length;
    const exact = count("exact");
    const masterTotal = statScopedRows.filter((r) => r.master).length;
    return {
      accuracy: masterTotal > 0 ? exact / masterTotal : 0,
      exact,
      masterTotal,
      wrongStat: count("wrong_stat"),
      wrongPlayer: count("wrong_player"),
      wrongTeam: count("wrong_team"),
      missed: count("missed"),
      extra: count("extra"),
    };
  }, [statScopedRows]);

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

  // Category breakdown that reflects the TEAM filter (but not the category
  // filter, so every category stays visible + clickable). This replaces
  // the previously-static result.byCategory so the "Accuracy by stat
  // category" chart updates when Both/Home/Away is toggled.
  const scopedCategoryBreakdown = useMemo(() => {
    if (!result) return [];
    const rows = result.rows.filter(
      (r) => teamFilter === "all" || rowTeam(r) === teamFilter
    );
    const map = new Map<string, { total: number; exact: number }>();
    for (const r of rows) {
      if (!r.master) continue;
      const category = r.master.category || "Uncategorised";
      const e = map.get(category) ?? { total: 0, exact: 0 };
      e.total += 1;
      if (r.status === "exact") e.exact += 1;
      map.set(category, e);
    }
    return Array.from(map.entries())
      .map(([category, v]) => ({
        category,
        total: v.total,
        exact: v.exact,
        accuracy: v.total > 0 ? v.exact / v.total : 0,
      }))
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, teamFilter]);

  // Per-player stats table. Driven by the active sport's config (see
  // SPORT_CONFIGS): the same aggregation, with sport-specific stat
  // classification, derived totals, columns and relevance filter.
  // Master is the gold standard; players only in the analyst are flagged.
  // Respects the active time-range + team filters.
  const playerTable = useMemo(() => {
    if (!canonical) return [];

    const inScope = (i: Instance) =>
      inRange(i) && (teamFilter === "all" || i.team === teamFilter);

    // key = "team|number"; keep display name + which side(s) it appears in.
    const rows = new Map<
      string,
      {
        team: string;
        number: number | null;
        master: PlayerCounts;
        analyst: PlayerCounts;
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
          master: sportConfig.init(),
          analyst: sportConfig.init(),
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
      sportConfig.bump(r.master, i.stat.toLowerCase());
    }
    for (const i of canonical.analyst) {
      if (!inScope(i)) continue;
      const r = ensure(i);
      r.inAnalyst = true;
      sportConfig.bump(r.analyst, i.stat.toLowerCase());
    }

    return Array.from(rows.values())
      .map((r) => ({
        key: `${r.team} - #${r.number ?? "?"}`,
        team: r.team,
        number: r.number,
        master: sportConfig.derive(r.master),
        analyst: sportConfig.derive(r.analyst),
        // A player only in the analyst (not in master) is incorrect.
        analystOnly: r.inAnalyst && !r.inMaster,
      }))
      // Drop players with no relevant stats on either side.
      .filter((r) => sportConfig.relevant(r.master, r.analyst))
      .sort((a, b) => {
        // Master players first, then by team, then by number.
        if (a.analystOnly !== b.analystOnly) return a.analystOnly ? 1 : -1;
        if (a.team !== b.team) return a.team.localeCompare(b.team);
        return (a.number ?? 999) - (b.number ?? 999);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical, effectiveRange, teamFilter, sportConfig]);

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
        // Store the raw XML so the check can be fully re-opened later.
        xmlMaster: master?.raw ?? null,
        xmlAnalyst: analyst?.raw ?? null,
        // Store the game video URL so it doesn't need re-finding.
        videoUrl: videoUrl || null,
        // Store the sport so it re-opens with the right stats table.
        sport,
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

        {/* Sport toggle */}
        <div className="mb-5 flex items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Sport
          </span>
          {(Object.values(SPORT_CONFIGS) as SportConfig[]).map((sc) => (
            <button
              key={sc.id}
              onClick={() => setSport(sc.id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                sport === sc.id
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {sc.label}
            </button>
          ))}
        </div>

        {/* Video URL + Watch */}
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Game video
          </span>
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Paste the game video URL (mp4 / direct link)"
            className="min-w-[280px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
          />
          <button
            onClick={() => videoUrl.trim() && setVideoOpen(true)}
            disabled={!videoUrl.trim()}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${ACCENT_BG} hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-300`}
          >
            <Video size={14} /> Watch
          </button>
          {videoUrl.trim() && (
            <span className="text-xs text-slate-400">
              Click any stat in the timeline to jump to that moment.
            </span>
          )}
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
            {savedMasters.length > 0 && (
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  ...or reuse a saved master
                </label>
                <select
                  value=""
                  onChange={(e) => {
                    const sm = savedMasters.find(
                      (m) => m.fileName === e.target.value
                    );
                    if (!sm) return;
                    setMaster({
                      name: sm.fileName,
                      instances: parseInstances(sm.xml),
                      raw: sm.xml,
                    });
                    // If this master had a video and none is set yet,
                    // prefill it too.
                    if (sm.videoUrl && !videoUrl) setVideoUrl(sm.videoUrl);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
                >
                  <option value="">Select a saved master...</option>
                  {savedMasters.map((m) => (
                    <option key={m.fileName} value={m.fileName}>
                      {m.fileName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="mt-2">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Coded by (master)
              </label>
              <AnalystCombobox
                value={masterAnalyst}
                onChange={setMasterAnalyst}
                options={analystNames}
              />
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
              <AnalystCombobox
                value={gradedAnalyst}
                onChange={setGradedAnalyst}
                options={analystNames}
              />
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
                onChange={(e) => {
                  setLabelEdited(true);
                  setMatchLabel(e.target.value);
                }}
                placeholder="Match label (auto: AnalystName_FileName)"
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

            {/* Active-filter chips */}
            {(statFilter !== "all" ||
              categoryFilter !== "all" ||
              teamFilter !== "all") && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold uppercase tracking-wide text-slate-500">
                  Showing:
                </span>
                {teamFilter !== "all" && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                    {teamFilter}
                  </span>
                )}
                {categoryFilter !== "all" && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                    {categoryFilter}
                  </span>
                )}
                {statFilter !== "all" && (
                  <span className="rounded-md bg-red-100 px-2 py-0.5 font-medium text-red-700">
                    {statFilter}
                  </span>
                )}
                <button
                  onClick={() => {
                    setStatFilter("all");
                    setCategoryFilter("all");
                    setTeamFilter("all");
                  }}
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
                >
                  <X size={12} /> Clear all
                </button>
              </div>
            )}

            {/* Summary cards — reflect the active team/category/stat filter */}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
              <StatCard
                label="Accuracy"
                value={`${(scopedSummary.accuracy * 100).toFixed(1)}%`}
                accent={
                  scopedSummary.accuracy >= 0.9
                    ? "text-emerald-600"
                    : scopedSummary.accuracy >= 0.75
                      ? "text-amber-600"
                      : "text-red-600"
                }
                sub={`${scopedSummary.exact}/${scopedSummary.masterTotal} exact`}
              />
              <StatCard label="Exact" value={`${scopedSummary.exact}`} accent="text-emerald-600" />
              <StatCard label="Wrong stat" value={`${scopedSummary.wrongStat}`} accent="text-amber-600" />
              <StatCard label="Wrong player" value={`${scopedSummary.wrongPlayer}`} accent="text-orange-600" />
              <StatCard label="Wrong team" value={`${scopedSummary.wrongTeam}`} accent="text-red-600" />
              <StatCard label="Missed" value={`${scopedSummary.missed}`} accent="text-slate-600" />
              <StatCard label="Extra" value={`${scopedSummary.extra}`} accent="text-purple-600" />
            </div>

            {/* Category breakdown */}
            {scopedCategoryBreakdown.length > 0 && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-700">
                    Accuracy by stat category
                  </h2>
                  <div className="flex items-center gap-3">
                    <TeamToggle
                      teams={realTeams.map((t) => t.team)}
                      value={teamFilter}
                      onChange={setTeamFilter}
                    />
                    {categoryFilter !== "all" && (
                      <button
                        onClick={() => setCategoryFilter("all")}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                      >
                        <X size={12} /> Clear category
                      </button>
                    )}
                  </div>
                </div>
                <p className="mb-3 text-xs text-slate-400">
                  Click a category to filter the breakdown table and timeline.
                </p>
                <div className="space-y-1">
                  {scopedCategoryBreakdown.map((c) => {
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
                      {scopedStatBreakdown.map((s) => {
                        const active = statFilter === s.stat;
                        return (
                        <tr
                          key={s.stat}
                          onClick={() =>
                            setStatFilter(active ? "all" : s.stat)
                          }
                          className={`cursor-pointer border-b border-slate-100 last:border-b-0 ${
                            active
                              ? "bg-red-50 ring-1 ring-inset ring-red-200"
                              : "hover:bg-slate-50/60"
                          }`}
                          title="Click to filter the timeline by this stat"
                        >
                          <td
                            className={`px-4 py-2 font-medium ${
                              active ? ACCENT_TEXT : "text-slate-800"
                            }`}
                          >
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
                        );
                      })}
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
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
                  <h2 className="text-sm font-semibold text-slate-700">
                    {sport === "afl"
                      ? "Player disposals & marks"
                      : "Player stats"}{" "}
                    <span className="font-normal text-slate-400">
                      (Master / Analyst)
                    </span>
                  </h2>
                  <div className="flex items-center gap-3">
                    <TeamToggle
                      teams={realTeams.map((t) => t.team)}
                      value={teamFilter}
                      onChange={setTeamFilter}
                    />
                    <button
                      onClick={() =>
                        exportPlayerCsv(
                          playerTable,
                          sportConfig.columns,
                          sportConfig.csvName
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      <Download size={13} /> Export CSV
                    </button>
                  </div>
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
                        {sportConfig.columns.map((col) => (
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
                        {sportConfig.columns.map((col) => (
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
                          {sportConfig.columns.map((col) => {
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
                        {sportConfig.columns.map((col) => {
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
                  {sport === "afl"
                    ? "Total Disposals = eff + ineff kicks & handballs. Marks = contested + uncontested only. "
                    : "Total Passes = complete + incomplete. "}
                  Analyst counts shown in red differ from the master.
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
                <TeamToggle
                  teams={realTeams.map((t) => t.team)}
                  value={teamFilter}
                  onChange={setTeamFilter}
                />
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
                All ({statScopedRows.length})
              </button>
              {(Object.keys(STATUS_META) as MatchStatus[]).map((s) => {
                const n = statScopedRows.filter((r) => r.status === s).length;
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
                      <TimelineCell
                        instance={row.master}
                        onSeek={videoUrl.trim() ? seekVideo : undefined}
                      />
                      <TimelineCell
                        instance={row.analyst}
                        delta={row.timeDelta}
                        onSeek={videoUrl.trim() ? seekVideo : undefined}
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

      {/* Split-screen review pop-up: video on the left half, both
          timelines (clickable) on the right half. */}
      {videoOpen && videoUrl.trim() && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 p-4 backdrop-blur-sm">
          <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Video size={15} /> Video review
                <span className="text-xs font-normal text-slate-400">
                  · click any stat to jump to that moment
                </span>
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <span>Show stat</span>
                  <select
                    value={videoStatFilter}
                    onChange={(e) => setVideoStatFilter(e.target.value)}
                    className="max-w-[240px] rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs font-medium normal-case text-slate-100 outline-none focus:border-sky-400"
                    aria-label="Select a stat to show in video review"
                  >
                    <option value="all">All stats</option>
                    {videoStatOptions.map((stat) => (
                      <option key={stat} value={stat}>
                        {stat}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => setVideoOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                  title="Close"
                >
                  <XIcon size={18} />
                </button>
              </div>
            </div>

            {/* Body: video (left) + timelines (right) */}
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
              {/* Left: video */}
              <div className="flex min-h-0 items-center justify-center bg-black p-2">
                <video
                  ref={videoRef}
                  src={videoUrl.trim()}
                  controls
                  onTimeUpdate={(e) =>
                    setVideoTime(e.currentTarget.currentTime)
                  }
                  className="max-h-full max-w-full"
                />
              </div>

              {/* Right: timelines */}
              <div className="flex min-h-0 flex-col border-t border-slate-700 lg:border-l lg:border-t-0">
                <div className="grid grid-cols-[90px_1fr_1fr] border-b border-slate-700 bg-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <div className="p-2.5">Status</div>
                  <div className="border-l border-slate-700 p-2.5">
                    Master
                  </div>
                  <div className="border-l border-slate-700 p-2.5">
                    Analyst
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto bg-white">
                  {videoRows.map((row, i) => {
                    const meta = STATUS_META[row.status];
                    // A selected stat can exist on only one side of a
                    // wrong-stat row. Keep each side independent so every
                    // matching instance remains visible.
                    const masterInstance =
                      videoStatFilter === "all" ||
                      row.master?.stat.trim() === videoStatFilter
                        ? row.master
                        : null;
                    const analystInstance =
                      videoStatFilter === "all" ||
                      row.analyst?.stat.trim() === videoStatFilter
                        ? row.analyst
                        : null;
                    const masterActive =
                      !!masterInstance &&
                      videoTime >= masterInstance.start &&
                      videoTime <= masterInstance.end;
                    const analystActive =
                      !!analystInstance &&
                      videoTime >= analystInstance.start &&
                      videoTime <= analystInstance.end;
                    const rowActive = masterActive || analystActive;
                    return (
                      <div
                        key={i}
                        ref={rowActive ? activeRowRef : undefined}
                        className={`grid grid-cols-[90px_1fr_1fr] border-b text-sm last:border-b-0 ${
                          rowActive
                            ? "border-sky-300 bg-sky-50"
                            : "border-slate-100"
                        }`}
                      >
                        <div className="flex items-center p-2.5">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${meta.badge}`}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <TimelineCell
                          instance={masterInstance}
                          onSeek={seekVideo}
                          active={masterActive}
                        />
                        <TimelineCell
                          instance={analystInstance}
                          delta={masterInstance && analystInstance ? row.timeDelta : null}
                          onSeek={seekVideo}
                          active={analystActive}
                        />
                      </div>
                    );
                  })}
                  {videoRows.length === 0 && (
                    <div className="p-8 text-center text-sm text-slate-400">
                      No instances for this stat.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Searchable analyst picker: type to filter, scrollable list, click to
// select. Replaces the native <select> (which scroll-jumps and can't be
// typed into).
function AnalystCombobox({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        value={open ? query : value}
        placeholder="Type to search analyst..."
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
      />
      {value && !open && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          title="Clear"
          type="button"
        >
          <XIcon size={14} />
        </button>
      )}
      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">No matches</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                  setQuery("");
                }}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 ${
                  o === value ? "bg-slate-50 font-semibold text-slate-900" : "text-slate-700"
                }`}
              >
                {o}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Both teams / Home / Away toggle. Shared above the category breakdown
// and the player table; changing it updates teamFilter, which every
// team-aware table on the page reads from.
function TeamToggle({
  teams,
  value,
  onChange,
}: {
  teams: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const btn = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
      active
        ? "bg-slate-900 text-white"
        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button onClick={() => onChange("all")} className={btn(value === "all")}>
        Both teams
      </button>
      {teams.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={btn(value === t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function TimelineCell({
  instance,
  delta,
  onSeek,
  active,
}: {
  instance: Instance | null;
  delta?: number | null;
  onSeek?: (seconds: number) => void;
  active?: boolean;
}) {
  if (!instance) {
    return (
      <div className="border-l border-slate-200 p-3">
        <span className="text-xs italic text-slate-300">— no entry —</span>
      </div>
    );
  }

  // Colour the whole cell by team: Home = green, Away = orange (teams
  // are canonicalised to Home/Away). Anything else (Unknown /
  // unattributed events) stays neutral.
  const teamKey = instance.team.trim().toLowerCase();
  const isHome = teamKey === "home";
  const isAway = teamKey === "away";
  const cellBg = isHome
    ? "bg-emerald-50 border-emerald-200"
    : isAway
      ? "bg-orange-50 border-orange-200"
      : "border-slate-200";

  const clickable = !!onSeek;

  return (
    <div
      className={`border-l p-3 ${cellBg} ${
        clickable ? "cursor-pointer hover:brightness-95" : ""
      } ${
        active ? "ring-2 ring-inset ring-sky-500" : ""
      }`}
      onClick={
        clickable
          ? () => onSeek!(instance.start)
          : undefined
      }
      title={clickable ? "Jump to this moment in the video" : undefined}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-xs font-semibold text-slate-500">
          {formatTime(instance.mid)}
        </span>
        {clickable && (
          <Video size={11} className="text-slate-400" />
        )}
        {delta != null && delta > 0 && (
          <span className="text-[10px] text-slate-400">
            (+{delta.toFixed(1)}s)
          </span>
        )}
        <span className="text-sm font-semibold text-slate-900">
          {instance.stat || instance.category || "—"}
        </span>
      </div>
      <p className="text-xs font-medium text-slate-500">
        {instance.team}
        {instance.playerNumber != null && (
          <span>
            {" "}
            · #{instance.playerNumber}
          </span>
        )}
      </p>
    </div>
  );
}
