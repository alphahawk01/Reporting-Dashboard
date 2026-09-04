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
  ChevronLeft,
  ChevronRight,
  Flag,
} from "lucide-react";
import {
  saveAccuracyCheck,
  getAccuracyCheckById,
  getSavedMasters,
  type SavedMaster,
} from "@/lib/api/accuracyChecks";
import { getPlatformAnalystNames } from "@/lib/api/analysts";
import { useAuth } from "@/components/auth/AuthContext";
import {
  createDispute,
  getDisputesForCheck,
  disputeKey,
  type Dispute,
  type DisputeSide,
} from "@/lib/api/disputes";
import {
  parseInstances,
  compareInstances,
  canonicaliseTeams,
  formatTime,
  parseTime,
  type Instance,
  type ComparisonRow,
  type MatchStatus,
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
        className={`flex h-[68px] cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 transition ${
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
            <FileText className="shrink-0 text-emerald-600" size={20} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {file.name}
              </p>
              <p className="text-xs text-slate-500">
                {file.instances.length} instances parsed
              </p>
            </div>
          </>
        ) : (
          <>
            <Upload className="shrink-0 text-slate-400" size={20} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {title}
              </p>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
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

/**
 * Does a single stat (lowercased) contribute to the given column for this
 * sport? Reuses the config's own bump()+derive() so it always matches how
 * the table is built: run the classifier on a fresh counts object holding
 * just this stat, then check whether the column's accessor picked it up.
 */
function statMatchesColumn(
  config: SportConfig,
  columnKey: string,
  statLower: string
): boolean {
  const col = config.columns.find((c) => c.key === columnKey);
  if (!col) return false;
  const counts = config.init();
  config.bump(counts, statLower);
  return col.get(config.derive(counts)) > 0;
}

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
  onClick,
}: {
  master: number;
  analyst: number;
  mismatch: boolean;
  /** When set, the pair of cells is clickable to review this stat/player. */
  onClick?: () => void;
}) {
  const clickable = !!onClick && master + analyst > 0;
  const base = clickable ? "cursor-pointer hover:bg-sky-50" : "";
  return (
    <>
      <td
        onClick={clickable ? onClick : undefined}
        title={clickable ? "Review this stat for this player in video" : undefined}
        className={`border-l border-slate-200 px-2 py-2 text-center tabular-nums text-slate-700 ${base}`}
      >
        {master}
      </td>
      <td
        onClick={clickable ? onClick : undefined}
        title={clickable ? "Review this stat for this player in video" : undefined}
        className={`px-2 py-2 text-center tabular-nums font-semibold ${
          mismatch ? "text-red-600" : "text-emerald-600"
        } ${base}`}
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

  // Optional player+stat focus for the video review, set by clicking a cell
  // in the player stats table. When set, the review timeline shows only that
  // player's instances of that column's stat(s). Cleared to review by stat.
  const [reviewPlayer, setReviewPlayer] = useState<{
    team: string;
    number: number | null;
    columnKey: string;
    columnLabel: string;
  } | null>(null);

  // Status filter inside the video review (Exact / Missed / Wrong stat …).
  // Independent of the main page's status filter.
  const [videoStatusFilter, setVideoStatusFilter] = useState<
    MatchStatus | "all"
  >("all");

  // Disputes: which saved check is loaded (if any), so instances can be
  // flagged and the flags reflected in both timelines.
  const { user } = useAuth();
  const [loadedCheckId, setLoadedCheckId] = useState<number | null>(null);
  const [checkAnalystName, setCheckAnalystName] = useState<string | null>(null);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  // Right-click context menu target for flagging.
  const [flagMenu, setFlagMenu] = useState<{
    x: number;
    y: number;
    instance: Instance;
    side: DisputeSide;
  } | null>(null);

  // Whether the current user may flag on the loaded check: an admin/super
  // admin, or the analyst the check is saved to.
  const canFlag =
    loadedCheckId != null &&
    !!user &&
    (user.role === "admin" ||
      user.role === "super_admin" ||
      (!!user.analyst_name &&
        !!checkAnalystName &&
        user.analyst_name.trim().toLowerCase() ===
          checkAnalystName.trim().toLowerCase()));

  // Fast lookup of flagged instances by "instanceId|side".
  const flaggedKeys = useMemo(() => {
    const m = new Map<string, Dispute>();
    for (const d of disputes) m.set(disputeKey(d.instance_id, d.side), d);
    return m;
  }, [disputes]);

  const reloadDisputes = async (checkId: number) => {
    try {
      setDisputes(await getDisputesForCheck(checkId));
    } catch (err) {
      console.error("Failed loading disputes:", err);
    }
  };

  // Index of the current clip within the filtered review rows, so Prev/Next
  // can step (and seek) between instances instead of playing through gaps.
  const [reviewIndex, setReviewIndex] = useState(0);

  // Auto-skip: when on, playback jumps to the next instance as soon as the
  // current instance's XML end time is reached (skipping the gaps).
  const [autoSkip, setAutoSkip] = useState(true);
  // Refs so the video's timeupdate handler reads fresh values without
  // re-binding or capturing stale closures.
  const reviewIndexRef = useRef(0);
  const autoSkipRef = useRef(true);
  const reviewClipsRef = useRef<{ start: number; end: number }[]>([]);
  useEffect(() => {
    reviewIndexRef.current = reviewIndex;
  }, [reviewIndex]);
  useEffect(() => {
    autoSkipRef.current = autoSkip;
  }, [autoSkip]);

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

  // Step to a clip (filtered review row) by index and seek the video to it.
  // Defined via ref-free closure over reviewSeekTimes at call sites below.
  const goToClip = (index: number, times: number[]) => {
    if (times.length === 0) return;
    const clamped = Math.max(0, Math.min(index, times.length - 1));
    setReviewIndex(clamped);
    seekVideo(times[clamped]);
  };

  // Video time updates: track position for row highlighting, and (when
  // auto-skip is on) jump to the next instance once the current instance's
  // XML end time is reached, so playback skips the gaps between clips.
  const handleVideoTimeUpdate = (
    e: React.SyntheticEvent<HTMLVideoElement>
  ) => {
    const t = e.currentTarget.currentTime;
    setVideoTime(t);

    if (!autoSkipRef.current) return;
    const clips = reviewClipsRef.current;
    const idx = reviewIndexRef.current;
    if (clips.length === 0 || idx >= clips.length) return;

    const current = clips[idx];
    // Small epsilon so we advance right at (not past) the end.
    if (t >= current.end - 0.05) {
      const nextIdx = idx + 1;
      if (nextIdx < clips.length) {
        const v = videoRef.current;
        reviewIndexRef.current = nextIdx;
        setReviewIndex(nextIdx);
        if (v) {
          v.currentTime = Math.max(0, clips[nextIdx].start);
          v.play().catch(() => {});
        }
      } else {
        // Last clip finished — stop so it doesn't run into the next game
        // action that isn't part of this filter.
        videoRef.current?.pause();
      }
    }
  };

  // Open the video review focused on one player's instances of a single
  // stat column (clicked from the player stats table), and jump the video to
  // the first matching instance instead of leaving it at the game start.
  const openPlayerReview = (
    player: { team: string; number: number | null },
    col: { key: string; label: string }
  ) => {
    setReviewPlayer({
      team: player.team,
      number: player.number,
      columnKey: col.key,
      columnLabel: col.label,
    });
    setVideoStatFilter("all");

    // Find the earliest matching instance so playback starts there.
    const teamLower = player.team.toLowerCase();
    const matches = (i: Instance | null) =>
      !!i &&
      i.team.toLowerCase() === teamLower &&
      i.playerNumber === player.number &&
      statMatchesColumn(sportConfig, col.key, i.stat.toLowerCase());

    let firstStart: number | null = null;
    for (const row of result?.rows ?? []) {
      for (const inst of [row.master, row.analyst]) {
        if (matches(inst)) {
          const s = (inst as Instance).start;
          if (firstStart === null || s < firstStart) firstStart = s;
        }
      }
    }

    if (firstStart !== null) {
      // seekVideo also opens the modal.
      seekVideo(firstStart);
    } else {
      setVideoOpen(true);
    }
  };

  // Right-click a timeline instance in the video review to flag it. Only
  // enabled when a saved check is loaded and the user is allowed to flag.
  const openFlagMenu = (
    e: React.MouseEvent,
    instance: Instance,
    side: DisputeSide
  ) => {
    if (!canFlag) return;
    e.preventDefault();
    setFlagMenu({ x: e.clientX, y: e.clientY, instance, side });
  };

  const submitFlag = async (reason: string | null) => {
    if (!flagMenu || loadedCheckId == null) return;
    const { instance, side } = flagMenu;
    setFlagMenu(null);
    try {
      await createDispute({
        checkId: loadedCheckId,
        instanceId: instance.id,
        side,
        stat: instance.stat || null,
        player:
          instance.playerNumber != null
            ? `#${instance.playerNumber}`
            : instance.playerRaw || null,
        team: instance.team || null,
        codeTime: instance.mid,
        raisedBy: user?.username ?? null,
        reason,
      });
      await reloadDisputes(loadedCheckId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to flag instance.");
    }
  };

  // Close the flag menu on any outside click / escape.
  useEffect(() => {
    if (!flagMenu) return;
    const close = () => setFlagMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFlagMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [flagMenu]);

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

  // Load the distinct analyst names for the allocation dropdowns. Unions the
  // shared platform `analysts` table (manually-added analysts) with the
  // Deputy roster, so newly-added analysts appear here immediately.
  useEffect(() => {
    let cancelled = false;

    getPlatformAnalystNames()
      .then((names) => {
        if (!cancelled) setAnalystNames(names);
      })
      .catch((err) => console.error("Failed loading analyst names:", err));

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

    // Optional deep-link from the Disputes page: open the video review and
    // seek to a specific instance (by its stat + start time seconds).
    const reviewSeek = params.get("seek");
    const reviewStat = params.get("stat");

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

      // Enable disputes for this saved check.
      setLoadedCheckId(check.id);
      setCheckAnalystName(check.analyst_name);
      reloadDisputes(check.id);

      // Deep-link: open the review focused on the disputed stat and seek to
      // it. Filter by stat so the reviewer sees that stat's instances, then
      // seek to the exact moment.
      if (reviewSeek != null && check.video_url) {
        const seconds = parseFloat(reviewSeek);
        if (!Number.isNaN(seconds)) {
          if (reviewStat) setVideoStatFilter(reviewStat);
          // seekVideo opens the modal and retries until the <video> mounts.
          seekVideo(seconds);
        }
      }
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
  // Reset the clip index when the review scope changes.
  useEffect(() => {
    setReviewIndex(0);
  }, [videoStatFilter, videoStatusFilter, reviewPlayer]);
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

    let rows: ComparisonRow[];

    // Player+stat focus (from clicking a player-table cell) takes priority:
    // show only instances for that player that belong to the clicked column.
    if (reviewPlayer) {
      const teamLower = reviewPlayer.team.toLowerCase();
      const matchesPlayer = (i: Instance | null) =>
        !!i &&
        i.team.toLowerCase() === teamLower &&
        i.playerNumber === reviewPlayer.number &&
        statMatchesColumn(
          sportConfig,
          reviewPlayer.columnKey,
          i.stat.toLowerCase()
        );
      rows = result.rows.filter(
        (row) => matchesPlayer(row.master) || matchesPlayer(row.analyst)
      );
    } else if (videoStatFilter === "all") {
      rows = result.rows;
    } else {
      rows = result.rows.filter(
        (row) =>
          row.master?.stat.trim() === videoStatFilter ||
          row.analyst?.stat.trim() === videoStatFilter
      );
    }

    // Layer the status filter (Exact / Missed / Wrong stat …) on top.
    if (videoStatusFilter !== "all") {
      rows = rows.filter((row) => row.status === videoStatusFilter);
    }

    return rows;
  }, [result, videoStatFilter, reviewPlayer, videoStatusFilter, sportConfig]);

  // Per-status counts for the video review filter buttons (reflect the
  // current stat/player scope, before the status filter is applied).
  const videoStatusCounts = useMemo(() => {
    if (!result) return {} as Record<MatchStatus, number>;

    let base: ComparisonRow[];
    if (reviewPlayer) {
      const teamLower = reviewPlayer.team.toLowerCase();
      const matchesPlayer = (i: Instance | null) =>
        !!i &&
        i.team.toLowerCase() === teamLower &&
        i.playerNumber === reviewPlayer.number &&
        statMatchesColumn(
          sportConfig,
          reviewPlayer.columnKey,
          i.stat.toLowerCase()
        );
      base = result.rows.filter(
        (row) => matchesPlayer(row.master) || matchesPlayer(row.analyst)
      );
    } else if (videoStatFilter === "all") {
      base = result.rows;
    } else {
      base = result.rows.filter(
        (row) =>
          row.master?.stat.trim() === videoStatFilter ||
          row.analyst?.stat.trim() === videoStatFilter
      );
    }

    const counts = {} as Record<MatchStatus, number>;
    for (const row of base) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    return counts;
  }, [result, videoStatFilter, reviewPlayer, sportConfig]);

  // Start/end window for each filtered review row: from whichever displayed
  // side is present (prefer master). Prev/Next seek to `start`; auto-skip
  // watches for playback passing `end` and jumps to the next clip.
  const reviewClips = useMemo(() => {
    const sideShows = (inst: Instance | null): boolean => {
      if (!inst) return false;
      if (reviewPlayer) {
        return (
          inst.team.toLowerCase() === reviewPlayer.team.toLowerCase() &&
          inst.playerNumber === reviewPlayer.number &&
          statMatchesColumn(
            sportConfig,
            reviewPlayer.columnKey,
            inst.stat.toLowerCase()
          )
        );
      }
      return videoStatFilter === "all" || inst.stat.trim() === videoStatFilter;
    };
    return videoRows.map((row) => {
      const m = sideShows(row.master) ? row.master : null;
      const a = sideShows(row.analyst) ? row.analyst : null;
      const inst = m ?? a;
      return { start: inst?.start ?? 0, end: inst?.end ?? 0 };
    });
  }, [videoRows, reviewPlayer, videoStatFilter, sportConfig]);

  const reviewSeekTimes = useMemo(
    () => reviewClips.map((c) => c.start),
    [reviewClips]
  );
  useEffect(() => {
    reviewClipsRef.current = reviewClips;
  }, [reviewClips]);

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
            onClick={() => {
              if (!videoUrl.trim()) return;
              setReviewPlayer(null);
              setVideoOpen(true);
            }}
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
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
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

        {/* Tolerance + time range controls (same row) */}
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {/* Tolerance control */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-sm font-semibold text-slate-700">
            Tolerance
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
            Match window; stat still must agree for exact.
          </span>
        </div>

        {/* Time range control */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Clock size={15} /> Range
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setRangeMode("auto")}
                title="Overlapping section"
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  rangeMode === "auto"
                    ? `${ACCENT_BG} text-white`
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Overlap
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

          {result && master && analyst && (
            <p className="mt-2.5 text-xs text-slate-500">
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

            {/* Category breakdown + per-stat breakdown (same row) */}
            <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-2">
            {/* Category breakdown */}
            {scopedCategoryBreakdown.length > 0 && (
              <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
                <div className="max-h-80 flex-1 space-y-1 overflow-y-auto">
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
              <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                <div className="max-h-80 flex-1 overflow-y-auto">
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
            </div>

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
                                onClick={
                                  videoUrl.trim()
                                    ? () => openPlayerReview(p, col)
                                    : undefined
                                }
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
                <div className="max-h-[340px] space-y-2.5 overflow-y-auto pr-1">
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
                        flagged={
                          !!row.master &&
                          flaggedKeys.has(disputeKey(row.master.id, "master"))
                        }
                      />
                      <TimelineCell
                        instance={row.analyst}
                        delta={row.timeDelta}
                        onSeek={videoUrl.trim() ? seekVideo : undefined}
                        flagged={
                          !!row.analyst &&
                          flaggedKeys.has(
                            disputeKey(row.analyst.id, "analyst")
                          )
                        }
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
                {reviewPlayer ? (
                  <span className="inline-flex items-center gap-2 rounded-md border border-sky-500/60 bg-sky-500/10 px-2.5 py-1.5 text-xs font-semibold text-sky-200">
                    {reviewPlayer.team} · #{reviewPlayer.number ?? "?"} ·{" "}
                    {reviewPlayer.columnLabel}
                    <button
                      onClick={() => setReviewPlayer(null)}
                      className="text-sky-300 hover:text-white"
                      title="Clear player filter"
                    >
                      <XIcon size={13} />
                    </button>
                  </span>
                ) : (
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
                )}
                <button
                  onClick={() => setVideoOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                  title="Close"
                >
                  <XIcon size={18} />
                </button>
              </div>
            </div>

            {/* Status filter + clip navigator bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-slate-900 px-4 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </span>
                <button
                  onClick={() => setVideoStatusFilter("all")}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    videoStatusFilter === "all"
                      ? "bg-white text-slate-900"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  All (
                  {Object.values(videoStatusCounts).reduce((a, b) => a + b, 0)})
                </button>
                {(Object.keys(STATUS_META) as MatchStatus[]).map((s) => {
                  const n = videoStatusCounts[s] ?? 0;
                  if (n === 0) return null;
                  const active = videoStatusFilter === s;
                  return (
                    <button
                      key={s}
                      onClick={() =>
                        setVideoStatusFilter(active ? "all" : s)
                      }
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                        active
                          ? "bg-white text-slate-900"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {STATUS_META[s].label} ({n})
                    </button>
                  );
                })}
              </div>

              {/* Clip navigator: jump straight to each instance. */}
              <div className="flex items-center gap-2">
                <label className="mr-1 inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoSkip}
                    onChange={(e) => setAutoSkip(e.target.checked)}
                    className="h-3.5 w-3.5 accent-sky-500"
                  />
                  Auto-skip
                </label>
                <button
                  onClick={() => goToClip(reviewIndex - 1, reviewSeekTimes)}
                  disabled={reviewSeekTimes.length === 0 || reviewIndex <= 0}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-40"
                  title="Previous instance"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="min-w-[52px] text-center text-xs font-semibold tabular-nums text-slate-300">
                  {reviewSeekTimes.length === 0
                    ? "0 / 0"
                    : `${reviewIndex + 1} / ${reviewSeekTimes.length}`}
                </span>
                <button
                  onClick={() => goToClip(reviewIndex + 1, reviewSeekTimes)}
                  disabled={
                    reviewSeekTimes.length === 0 ||
                    reviewIndex >= reviewSeekTimes.length - 1
                  }
                  className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-40"
                  title="Next instance"
                >
                  Next <ChevronRight size={14} />
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
                  onTimeUpdate={handleVideoTimeUpdate}
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
                    // A selected stat/player can exist on only one side of a
                    // row. Keep each side independent so every matching
                    // instance stays visible and the other side blanks out.
                    const sideShows = (inst: Instance | null) => {
                      if (!inst) return false;
                      if (reviewPlayer) {
                        return (
                          inst.team.toLowerCase() ===
                            reviewPlayer.team.toLowerCase() &&
                          inst.playerNumber === reviewPlayer.number &&
                          statMatchesColumn(
                            sportConfig,
                            reviewPlayer.columnKey,
                            inst.stat.toLowerCase()
                          )
                        );
                      }
                      return (
                        videoStatFilter === "all" ||
                        inst.stat.trim() === videoStatFilter
                      );
                    };
                    const masterInstance = sideShows(row.master)
                      ? row.master
                      : null;
                    const analystInstance = sideShows(row.analyst)
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
                          flagged={
                            !!masterInstance &&
                            flaggedKeys.has(
                              disputeKey(masterInstance.id, "master")
                            )
                          }
                          onFlag={
                            canFlag && masterInstance
                              ? (e) => openFlagMenu(e, masterInstance, "master")
                              : undefined
                          }
                        />
                        <TimelineCell
                          instance={analystInstance}
                          delta={masterInstance && analystInstance ? row.timeDelta : null}
                          onSeek={seekVideo}
                          active={analystActive}
                          flagged={
                            !!analystInstance &&
                            flaggedKeys.has(
                              disputeKey(analystInstance.id, "analyst")
                            )
                          }
                          onFlag={
                            canFlag && analystInstance
                              ? (e) =>
                                  openFlagMenu(e, analystInstance, "analyst")
                              : undefined
                          }
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

      {/* Flag-as-dispute context menu (right-click a review instance). */}
      {flagMenu && (
        <FlagMenu
          x={flagMenu.x}
          y={flagMenu.y}
          instance={flagMenu.instance}
          side={flagMenu.side}
          alreadyFlagged={flaggedKeys.has(
            disputeKey(flagMenu.instance.id, flagMenu.side)
          )}
          onSubmit={submitFlag}
        />
      )}
    </div>
  );
}

// Small popover shown on right-clicking a review instance: optional reason
// then flag. Stops propagation so the outside-click handler doesn't close it.
function FlagMenu({
  x,
  y,
  instance,
  side,
  alreadyFlagged,
  onSubmit,
}: {
  x: number;
  y: number;
  instance: Instance;
  side: DisputeSide;
  alreadyFlagged: boolean;
  onSubmit: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  // Keep the menu on-screen.
  const left = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 280);
  const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 180);
  return (
    <div
      className="fixed z-[60] w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <Flag size={13} className="text-amber-600" /> Flag as dispute
      </p>
      <p className="mb-2 truncate text-[11px] text-slate-500">
        {side === "master" ? "Master" : "Analyst"} ·{" "}
        {instance.stat || "—"}
        {instance.playerNumber != null ? ` · #${instance.playerNumber}` : ""}
      </p>
      {alreadyFlagged && (
        <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
          Already flagged — submitting updates the reason.
        </p>
      )}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        autoFocus
        placeholder="Reason (optional)"
        className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-amber-500"
      />
      <button
        onClick={() => onSubmit(reason.trim() || null)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
      >
        <Flag size={13} /> Flag instance
      </button>
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
  flagged,
  onFlag,
}: {
  instance: Instance | null;
  delta?: number | null;
  onSeek?: (seconds: number) => void;
  active?: boolean;
  flagged?: boolean;
  onFlag?: (e: React.MouseEvent) => void;
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
      } ${flagged ? "ring-2 ring-inset ring-amber-500" : ""}`}
      onClick={
        clickable
          ? () => onSeek!(instance.start)
          : undefined
      }
      onContextMenu={onFlag}
      title={
        onFlag
          ? "Click to jump · right-click to flag as dispute"
          : clickable
            ? "Jump to this moment in the video"
            : undefined
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-xs font-semibold text-slate-500">
          {formatTime(instance.mid)}
        </span>
        {clickable && (
          <Video size={11} className="text-slate-400" />
        )}
        {flagged && (
          <Flag
            size={11}
            className="fill-amber-500 text-amber-600"
          />
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
