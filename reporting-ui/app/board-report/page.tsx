"use client";

// Board Report — a summarised, print-ready view of workforce cost, hours and
// games over a chosen month or date range. All data comes from the project's
// own Supabase tables (deputy_shifts for labour cost/hours, TT_Games for games
// coded) — the same source the Reporting dashboard reads — so no spreadsheet
// upload is needed and the numbers reconcile with that page.
//
// Flow: pick a month (quick preset) or a custom from/to range → Generate →
// a clean summary renders (headline KPIs, cost by area, monthly trend, Home vs
// Office split, games by location, top analysts). "Print / Save PDF" opens the
// browser print dialog (board-ready, no extra deps); "Export CSV" downloads the
// summary tables.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText,
  Loader2,
  AlertTriangle,
  Printer,
  Download,
  CalendarRange,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  buildBoardReport,
  buildWeekReport,
  compareReports,
  monthLabel,
  type BoardReport,
  type BoardComparison,
  type MetricDelta,
  type ShiftRow,
  type GameRow,
} from "@/lib/analytics/boardReport";

// ── Date helpers ────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// First/last calendar day of a given yyyy-mm month.
function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0); // day 0 of next month = last day of this month
  return { from: toISO(from), to: toISO(to) };
}

function thisMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function lastMonthKey(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// A small list of recent months for the month picker (most recent first).
function recentMonths(count = 18): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: monthLabel(key) });
  }
  return out;
}

// Supabase caps an unpaginated select at 1000 rows — page through with range().
async function loadAll(table: string): Promise<Record<string, unknown>[]> {
  const pageSize = 1000;
  let rows: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows = rows.concat(data as Record<string, unknown>[]);
    from += pageSize;
    if (data.length < pageSize) break;
  }
  return rows;
}

// ── Formatting ───────────────────────────────────────────────────────────────

const money = (v: number) =>
  `$${Math.round(v || 0).toLocaleString("en-AU")}`;
const money2 = (v: number) =>
  `$${(v || 0).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const hours = (v: number) =>
  `${Math.round(v || 0).toLocaleString("en-AU")}`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function rangeLabel(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00`);
  const t = new Date(`${to}T00:00:00`);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(f)} – ${fmt(t)}`;
}

// ── CSV export ────────────────────────────────────────────────────────────────

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function reportToCsv(r: BoardReport, entitlementsPct: number): string {
  const lines: string[] = [];
  const row = (...cells: (string | number)[]) =>
    lines.push(cells.map(csvEscape).join(","));

  row("Premier Data — Board Report");
  row("Period", rangeLabel(r.from, r.to));
  row("");
  row("Headline");
  row("Total labour cost (Deputy + PHL)", Math.round(r.totalCostWithPhl));
  row("  Deputy labour cost", Math.round(r.totalCost));
  row("  Philippines fixed cost", Math.round(r.phlFixedCost));
  row("Total hours", Math.round(r.totalHours));
  row("Games coded", r.totalGames);
  row("Active analysts", r.headcount);
  row("Shifts", r.shiftCount);
  row("Avg cost / hour", r.avgCostPerHour.toFixed(2));
  row("Avg cost / game", r.avgCostPerGame.toFixed(2));
  row("Avg hours / game", r.avgHoursPerGame.toFixed(2));
  row("");
  row("Australia (Home + Office analyst coding)");
  row("Coding cost", Math.round(r.pureCodingCost));
  row("Coding hours", Math.round(r.pureCodingHours));
  row("AUS games", r.ausGames);
  row("AUS % of games", pct(r.ausGamesShare));
  row("AUS cost / game", r.ausCostPerGame.toFixed(2));
  row("AUS hours / game", r.ausHoursPerGame.toFixed(2));
  row("");
  row("Incorporated coding (Home+Office+Ops+CustSvc+QA+QC)");
  row("Incorporated cost", Math.round(r.incCodingCost));
  row("Incorporated hours", Math.round(r.incCodingHours));
  row("Incorporated cost / game", r.incCostPerGame.toFixed(2));
  row("Incorporated hours / game", r.incHoursPerGame.toFixed(2));
  row("");
  row("Incorporated cost + entitlements");
  row("Entitlements %", `${entitlementsPct}%`);
  row(
    "Total incl. entitlements",
    Math.round(r.incCodingCost * (1 + entitlementsPct / 100))
  );
  row(
    "Cost / game incl. entitlements",
    r.ausGames > 0
      ? ((r.incCodingCost * (1 + entitlementsPct / 100)) / r.ausGames).toFixed(2)
      : "0.00"
  );
  row("");
  {
    const ausWithEnt = r.incCodingCost * (1 + entitlementsPct / 100);
    const blendedCost = ausWithEnt + r.phlFixedCost;
    row("Blended cost (AUS incl. entitlements + PHL fixed)");
    row("Blended total cost", Math.round(blendedCost));
    row("Blended total games", r.totalGames);
    row(
      "Blended cost / game",
      r.totalGames > 0 ? (blendedCost / r.totalGames).toFixed(2) : "0.00"
    );
    row("");
  }
  row("Philippines (fixed cost)");
  row("Weeks in range", r.weeksInRange.toFixed(2));
  row("Weekly rate", 3800);
  row("PHL fixed cost", Math.round(r.phlFixedCost));
  row("PHL games", r.phlGames);
  row("PHL % of games", pct(r.phlGamesShare));
  row("PHL cost / game", r.phlCostPerGame.toFixed(2));
  row("");
  row("Cost by area", "Cost", "Hours", "Shifts", "Share");
  for (const a of r.byArea) {
    row(a.area, Math.round(a.cost), Math.round(a.hours), a.shifts, pct(a.costShare));
  }
  row("");
  row("By month", "Cost", "Hours", "Games");
  for (const m of r.byMonth) {
    row(m.label, Math.round(m.cost), Math.round(m.hours), m.games);
  }
  row("");
  row("Labour cost split", "Cost");
  row("Home analyst", Math.round(r.homeVsOffice.home));
  row("Office analyst", Math.round(r.homeVsOffice.office));
  row("Other areas", Math.round(r.homeVsOffice.other));
  row("");
  row("Games by location", "Games");
  row("Australia", r.gamesByLocation.aus);
  row("Philippines", r.gamesByLocation.phl);
  row("Other", r.gamesByLocation.other);
  row("");
  row("Top analysts by games", "Games", "Hours", "Cost");
  for (const a of r.topAnalystsByGames) {
    row(a.name, a.games, Math.round(a.hours), Math.round(a.cost));
  }
  return lines.join("\n");
}

function downloadCsv(r: BoardReport, entitlementsPct: number) {
  const blob = new Blob([reportToCsv(r, entitlementsPct)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `board-report_${r.from}_to_${r.to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Small presentational pieces ───────────────────────────────────────────────

function Kpi({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {delta && <div className="mt-1">{delta}</div>}
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Bar({ frac, color = "#2563eb" }: { frac: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: color }}
      />
    </div>
  );
}

// A compact change badge for period-over-period comparison. `kind` controls
// the colour meaning: for "cost" a rise is red (bad) and a fall green (good);
// for "neutral" (games, hours) a rise is green and a fall red; "none" greys it.
function Delta({
  d,
  format,
  kind = "neutral",
}: {
  d: MetricDelta | undefined;
  format: (v: number) => string;
  kind?: "cost" | "neutral";
}) {
  if (!d) return null;
  if (d.direction === "flat") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-slate-400">
        <Minus size={11} /> no change
      </span>
    );
  }
  const up = d.direction === "up";
  // Is this movement "good"? For cost, down is good; for the rest, up is good.
  const good = kind === "cost" ? !up : up;
  const color = good ? "text-emerald-600" : "text-red-600";
  const Icon = up ? TrendingUp : TrendingDown;
  const pctText =
    d.pct == null ? "" : ` (${d.pct > 0 ? "+" : ""}${(d.pct * 100).toFixed(1)}%)`;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Icon size={11} />
      {d.delta > 0 ? "+" : "−"}
      {format(Math.abs(d.delta))}
      {pctText}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Mode = "month" | "week" | "range";

export default function BoardReportPage() {
  const months = useMemo(() => recentMonths(18), []);
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState<string>(lastMonthKey());
  const [week, setWeek] = useState<number | null>(null);
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  // Compare against the previous period (previous month / previous week).
  const [compare, setCompare] = useState<boolean>(true);
  // Entitlements uplift applied to the incorporated coding cost. `draft` is
  // what the user is typing; `applied` is what the totals use (updated on
  // Calculate), so the figures don't jump around as they type. Default 15%.
  const [entitlementsDraft, setEntitlementsDraft] = useState<string>("15");
  const [entitlementsPct, setEntitlementsPct] = useState<number>(15);

  // The raw data, loaded ONCE on mount so the week dropdown can be populated
  // and generation (incl. the comparison period) is instant with no refetch.
  const [shiftRows, setShiftRows] = useState<ShiftRow[]>([]);
  const [gameRows, setGameRows] = useState<GameRow[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [report, setReport] = useState<BoardReport | null>(null);
  const [prevReport, setPrevReport] = useState<BoardReport | null>(null);
  const [comparison, setComparison] = useState<BoardComparison | null>(null);
  const [prevLabel, setPrevLabel] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [shifts, games] = await Promise.all([
          loadAll("deputy_shifts"),
          loadAll("TT_Games"),
        ]);
        if (cancelled) return;
        setShiftRows(shifts as ShiftRow[]);
        setGameRows(games as GameRow[]);
        setDataReady(true);
      } catch (err) {
        if (cancelled) return;
        console.error("Board report: failed loading data", err);
        setDataError(
          err instanceof Error ? err.message : "Failed to load report data."
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The data weeks present (Wed→Tue week numbers), descending. Week 0 is the
  // pre-season catch-all; keep it but label it clearly.
  const weekOptions = useMemo(() => {
    const set = new Set<number>();
    for (const r of shiftRows) {
      const w = Number(r.week);
      if (Number.isFinite(w)) set.add(w);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [shiftRows]);

  // Default the week selector to the most recent week once data loads.
  useEffect(() => {
    if (week == null && weekOptions.length > 0) setWeek(weekOptions[0]);
  }, [weekOptions, week]);

  // The previous month key ("yyyy-mm" minus one month).
  const prevMonthOf = (ym: string): string => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const generate = useCallback(() => {
    if (!dataReady) {
      setError("Still loading data — try again in a moment.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let current: BoardReport;
      let previous: BoardReport | null = null;
      let prevLbl = "";

      if (mode === "month") {
        if (!month) {
          setError("Pick a month.");
          setLoading(false);
          return;
        }
        const b = monthBounds(month);
        current = buildBoardReport(shiftRows, gameRows, b.from, b.to);
        if (compare) {
          const pm = prevMonthOf(month);
          const pb = monthBounds(pm);
          previous = buildBoardReport(shiftRows, gameRows, pb.from, pb.to);
          prevLbl = monthLabel(pm);
        }
      } else if (mode === "week") {
        if (week == null) {
          setError("Pick a week.");
          setLoading(false);
          return;
        }
        current = buildWeekReport(shiftRows, gameRows, week);
        if (compare && week - 1 >= 0 && weekOptions.includes(week - 1)) {
          previous = buildWeekReport(shiftRows, gameRows, week - 1);
          prevLbl = `Week ${week - 1}`;
        }
      } else {
        if (!customFrom || !customTo) {
          setError("Pick a valid from/to date range.");
          setLoading(false);
          return;
        }
        const from = customFrom <= customTo ? customFrom : customTo;
        const to = customFrom <= customTo ? customTo : customFrom;
        current = buildBoardReport(shiftRows, gameRows, from, to);
        // No automatic "previous" for an arbitrary custom range.
      }

      setReport(current);
      setPrevReport(previous);
      setComparison(previous ? compareReports(current, previous) : null);
      setPrevLabel(prevLbl);
    } catch (err) {
      console.error("Board report failed:", err);
      setError(
        err instanceof Error ? err.message : "Failed to build the board report."
      );
      setReport(null);
      setComparison(null);
    } finally {
      setLoading(false);
    }
  }, [
    dataReady,
    mode,
    month,
    week,
    weekOptions,
    customFrom,
    customTo,
    compare,
    shiftRows,
    gameRows,
  ]);

  const selectClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500";

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Controls — hidden when printing so the PDF is just the report. */}
      <div className="print:hidden">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
            <FileText size={26} /> Board Report
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            A summarised view of workforce cost, hours and games — by month,
            week, or a custom date range. Compare against the previous period to
            see the increase or decrease. Built live from the platform&rsquo;s
            own data (Deputy shifts + games coded).
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!dataReady && !dataError && (
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={15} className="animate-spin" /> Loading data…
            </div>
          )}
          {dataError && (
            <div className="mb-3 flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle size={15} /> {dataError}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-4">
            {/* Mode toggle */}
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Period type
              </label>
              <div className="inline-flex rounded-lg border border-slate-300 p-0.5">
                {(["month", "week", "range"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                      mode === m
                        ? "bg-blue-600 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {m === "range" ? "Date range" : m}
                  </button>
                ))}
              </div>
            </div>

            {mode === "month" && (
              <div className="min-w-[220px]">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Month
                </label>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className={selectClass}
                >
                  {months.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {mode === "week" && (
              <div className="min-w-[220px]">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Week
                </label>
                <select
                  value={week ?? ""}
                  onChange={(e) => setWeek(Number(e.target.value))}
                  className={selectClass}
                  disabled={weekOptions.length === 0}
                >
                  {weekOptions.length === 0 && <option value="">—</option>}
                  {weekOptions.map((w) => (
                    <option key={w} value={w}>
                      {w === 0 ? "Week 0 (pre-season)" : `Week ${w}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {mode === "range" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                    From
                  </label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className={selectClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                    To
                  </label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className={selectClass}
                  />
                </div>
              </>
            )}

            {/* Compare toggle — only meaningful for month/week (a custom range
                has no well-defined "previous period"). */}
            {mode !== "range" && (
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={compare}
                  onChange={(e) => setCompare(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Compare to previous {mode}
              </label>
            )}

            <button
              onClick={generate}
              disabled={loading || !dataReady}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <CalendarRange size={15} /> Generate report
                </>
              )}
            </button>

            {/* Quick presets */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode("month");
                  setMonth(thisMonthKey());
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                This month
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("month");
                  setMonth(lastMonthKey());
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Last month
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle size={15} /> {error}
            </div>
          )}
        </div>
      </div>

      {/* Report */}
      {report && (
        <div className="mt-6">
          {/* Report header + actions */}
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Premier Data — Board Report
              </h2>
              <p className="text-sm text-slate-500">
                {rangeLabel(report.from, report.to)}
              </p>
            </div>
            <div className="flex gap-2 print:hidden">
              <button
                onClick={() => downloadCsv(report, entitlementsPct)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <Download size={15} /> Export CSV
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900"
              >
                <Printer size={15} /> Print / Save PDF
              </button>
            </div>
          </div>

          {comparison && prevLabel && (
            <p className="-mt-2 mb-3 text-xs text-slate-500">
              Compared to{" "}
              <span className="font-medium text-slate-700">{prevLabel}</span>.
            </p>
          )}

          {/* Headline KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi
              label="Total labour cost"
              value={money(report.totalCostWithPhl)}
              sub={`${money(report.totalCost)} Deputy + ${money(report.phlFixedCost)} PHL`}
              delta={
                comparison && (
                  <Delta
                    d={comparison.totalCostWithPhl}
                    format={money}
                    kind="cost"
                  />
                )
              }
            />
            <Kpi
              label="Total hours"
              value={hours(report.totalHours)}
              delta={
                comparison && (
                  <Delta d={comparison.totalHours} format={hours} />
                )
              }
            />
            <Kpi
              label="Games coded"
              value={report.totalGames.toLocaleString("en-AU")}
              delta={
                comparison && (
                  <Delta
                    d={comparison.totalGames}
                    format={(v) => Math.round(v).toLocaleString("en-AU")}
                  />
                )
              }
            />
          </div>

          {/* AUS vs PHL — games, cost per game and hours per game for each
              location. Each team's per-game figures use ITS OWN games only. */}
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Australia vs Philippines
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* AUS */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-blue-900">
                    🇦🇺 Australia
                  </span>
                  <span className="text-xs font-semibold text-blue-700">
                    {pct(report.ausGamesShare)} of games
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-900">
                      {report.ausGames.toLocaleString("en-AU")}
                    </div>
                    <div className="text-xs text-blue-700">games</div>
                    {comparison && (
                      <div className="mt-0.5">
                        <Delta
                          d={comparison.ausGames}
                          format={(v) => Math.round(v).toLocaleString("en-AU")}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-900">
                      {report.ausGames > 0 ? money2(report.ausCostPerGame) : "—"}
                    </div>
                    <div className="text-xs text-blue-700">cost / game</div>
                    {comparison && (
                      <div className="mt-0.5">
                        <Delta
                          d={comparison.ausCostPerGame}
                          format={money2}
                          kind="cost"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-900">
                      {report.ausGames > 0
                        ? report.ausHoursPerGame.toFixed(2)
                        : "—"}
                    </div>
                    <div className="text-xs text-blue-700">hours / game</div>
                    {comparison && (
                      <div className="mt-0.5">
                        <Delta
                          d={comparison.ausHoursPerGame}
                          format={(v) => v.toFixed(2)}
                          kind="cost"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 border-t border-blue-200 pt-2 text-xs text-slate-600">
                  Home + Office analyst coding: {money(report.pureCodingCost)} ·{" "}
                  {hours(report.pureCodingHours)} hrs
                </div>
              </div>

              {/* PHL */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-amber-900">
                    🇵🇭 Philippines
                  </span>
                  <span className="text-xs font-semibold text-amber-700">
                    {pct(report.phlGamesShare)} of games
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-2xl font-bold text-amber-900">
                      {report.phlGames.toLocaleString("en-AU")}
                    </div>
                    <div className="text-xs text-amber-700">games</div>
                    {comparison && (
                      <div className="mt-0.5">
                        <Delta
                          d={comparison.phlGames}
                          format={(v) => Math.round(v).toLocaleString("en-AU")}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-amber-900">
                      {report.phlGames > 0 ? money2(report.phlCostPerGame) : "—"}
                    </div>
                    <div className="text-xs text-amber-700">cost / game</div>
                    {comparison && (
                      <div className="mt-0.5">
                        <Delta
                          d={comparison.phlCostPerGame}
                          format={money2}
                          kind="cost"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-amber-400">—</div>
                    <div className="text-xs text-amber-700">hours / game</div>
                  </div>
                </div>
                <div className="mt-3 border-t border-amber-200 pt-2 text-xs text-slate-600">
                  Fixed {money(3800)}/wk × {report.weeksInRange.toFixed(1)} wks ={" "}
                  {money(report.phlFixedCost)} · hours not tracked
                </div>
              </div>
            </div>
          </section>

          {/* Incorporated coding cost — the broader AUS cost base (coding +
              the support functions that wrap around it), over AUS games. */}
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Incorporated coding cost (Australia)
            </h3>
            <p className="mb-4 text-xs text-slate-500">
              Home + Office analyst plus Operations Coordinator, Customer
              Service, Accuracy&nbsp;-&nbsp;QA and Quality Control, over{" "}
              {report.ausGames.toLocaleString("en-AU")} AUS games.
            </p>
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div>
                <div className="text-2xl font-bold text-slate-900">
                  {money(report.incCodingCost)}
                </div>
                <div className="text-xs text-slate-500">total cost</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">
                  {hours(report.incCodingHours)}
                </div>
                <div className="text-xs text-slate-500">total hours</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">
                  {report.ausGames > 0 ? money2(report.incCostPerGame) : "—"}
                </div>
                <div className="text-xs text-slate-500">cost / game</div>
                {comparison && (
                  <div className="mt-0.5 flex justify-center">
                    <Delta
                      d={comparison.incCostPerGame}
                      format={money2}
                      kind="cost"
                    />
                  </div>
                )}
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">
                  {report.ausGames > 0 ? report.incHoursPerGame.toFixed(2) : "—"}
                </div>
                <div className="text-xs text-slate-500">hours / game</div>
                {comparison && (
                  <div className="mt-0.5 flex justify-center">
                    <Delta
                      d={comparison.incHoursPerGame}
                      format={(v) => v.toFixed(2)}
                      kind="cost"
                    />
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Incorporated cost + entitlements uplift. Pure presentation layer:
              incorporated cost × (1 + entitlements%). The % is editable; the
              totals update when the user hits Calculate. */}
          {(() => {
            const factor = 1 + entitlementsPct / 100;
            const entCost = report.incCodingCost * factor;
            const entCostPerGame =
              report.ausGames > 0 ? entCost / report.ausGames : 0;
            return (
              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Incorporated cost + entitlements
                  </h3>
                  {/* Editable entitlements % + Calculate (hidden when printing;
                      the applied % still shows in the heading note below). */}
                  <div className="flex items-end gap-2 print:hidden">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                        Entitlements %
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          value={entitlementsDraft}
                          onChange={(e) => setEntitlementsDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const v = Number(entitlementsDraft);
                              if (Number.isFinite(v) && v >= 0)
                                setEntitlementsPct(v);
                            }
                          }}
                          className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
                        />
                        <span className="text-sm text-slate-500">%</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const v = Number(entitlementsDraft);
                        if (Number.isFinite(v) && v >= 0) setEntitlementsPct(v);
                      }}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Calculate
                    </button>
                  </div>
                </div>
                <p className="mb-4 text-xs text-slate-500">
                  Incorporated coding cost plus a{" "}
                  <span className="font-medium text-slate-700">
                    {entitlementsPct}%
                  </span>{" "}
                  entitlements uplift, over{" "}
                  {report.ausGames.toLocaleString("en-AU")} AUS games.
                </p>
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <div>
                    <div className="text-2xl font-bold text-slate-900">
                      {money(entCost)}
                    </div>
                    <div className="text-xs text-slate-500">
                      total incl. entitlements
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">
                      {money(entCost - report.incCodingCost)}
                    </div>
                    <div className="text-xs text-slate-500">
                      entitlements ({entitlementsPct}%)
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">
                      {report.ausGames > 0 ? money2(entCostPerGame) : "—"}
                    </div>
                    <div className="text-xs text-slate-500">cost / game</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-500">
                      {money(report.incCodingCost)}
                    </div>
                    <div className="text-xs text-slate-500">
                      base (before uplift)
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* Blended cost — the entitlements-inclusive AUS incorporated cost
              PLUS the PHL fixed cost, over ALL games (AUS + PHL). Uses the same
              applied entitlements % as the section above, so it recalculates
              when that % changes. Entitlements apply only to the AUS portion;
              the PHL fixed cost is added as-is. */}
          {(() => {
            const ausWithEnt =
              report.incCodingCost * (1 + entitlementsPct / 100);
            const blendedCost = ausWithEnt + report.phlFixedCost;
            const blendedGames = report.totalGames;
            const blendedCostPerGame =
              blendedGames > 0 ? blendedCost / blendedGames : 0;
            return (
              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Blended cost (Australia + Philippines)
                </h3>
                <p className="mb-4 text-xs text-slate-500">
                  Incorporated coding cost incl.{" "}
                  <span className="font-medium text-slate-700">
                    {entitlementsPct}%
                  </span>{" "}
                  entitlements, plus the Philippines fixed cost, over all{" "}
                  {blendedGames.toLocaleString("en-AU")} games coded
                  (AUS&nbsp;+&nbsp;PHL). Entitlements apply to the AUS portion
                  only.
                </p>
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <div>
                    <div className="text-2xl font-bold text-slate-900">
                      {money(blendedCost)}
                    </div>
                    <div className="text-xs text-slate-500">total cost</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">
                      {blendedGames.toLocaleString("en-AU")}
                    </div>
                    <div className="text-xs text-slate-500">total games</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">
                      {blendedGames > 0 ? money2(blendedCostPerGame) : "—"}
                    </div>
                    <div className="text-xs text-slate-500">
                      blended cost / game
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-600">
                      {money(ausWithEnt)} AUS
                    </div>
                    <div className="text-sm font-medium text-slate-600">
                      + {money(report.phlFixedCost)} PHL
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      incl. {entitlementsPct}% entitlements (AUS)
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* Cost by area */}
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Cost by area
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2">Area</th>
                  <th className="pb-2 text-right">Cost</th>
                  <th className="pb-2 text-right">Hours</th>
                  <th className="pb-2 text-right">Shifts</th>
                  <th className="w-40 pb-2 pl-4">Share</th>
                </tr>
              </thead>
              <tbody>
                {report.byArea.map((a) => (
                  <tr key={a.area} className="border-t border-slate-100">
                    <td className="py-1.5 font-medium text-slate-800">{a.area}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-800">
                      {money(a.cost)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">
                      {hours(a.hours)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">
                      {a.shifts}
                    </td>
                    <td className="py-1.5 pl-4">
                      <div className="flex items-center gap-2">
                        <Bar frac={a.costShare} />
                        <span className="w-12 text-right text-xs tabular-nums text-slate-500">
                          {pct(a.costShare)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Monthly trend (only meaningful when the range spans >1 month) */}
            {report.byMonth.length > 1 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Monthly breakdown
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="pb-2">Month</th>
                      <th className="pb-2 text-right">Cost</th>
                      <th className="pb-2 text-right">Hours</th>
                      <th className="pb-2 text-right">Games</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byMonth.map((m) => (
                      <tr key={m.key} className="border-t border-slate-100">
                        <td className="py-1.5 font-medium text-slate-800">
                          {m.label}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-800">
                          {money(m.cost)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">
                          {hours(m.hours)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">
                          {m.games}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Splits */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Labour cost split &amp; games
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Home analysts</span>
                  <span className="font-medium tabular-nums text-slate-800">
                    {money(report.homeVsOffice.home)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Office analysts</span>
                  <span className="font-medium tabular-nums text-slate-800">
                    {money(report.homeVsOffice.office)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Other areas</span>
                  <span className="font-medium tabular-nums text-slate-800">
                    {money(report.homeVsOffice.other)}
                  </span>
                </div>
                <hr className="border-slate-100" />
                <div className="flex justify-between">
                  <span className="text-slate-600">Games — Australia</span>
                  <span className="font-medium tabular-nums text-slate-800">
                    {report.gamesByLocation.aus.toLocaleString("en-AU")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Games — Philippines</span>
                  <span className="font-medium tabular-nums text-slate-800">
                    {report.gamesByLocation.phl.toLocaleString("en-AU")}
                  </span>
                </div>
                {report.gamesByLocation.other > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Games — Other</span>
                    <span className="font-medium tabular-nums text-slate-800">
                      {report.gamesByLocation.other.toLocaleString("en-AU")}
                    </span>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Top analysts */}
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Top analysts by games coded
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2">Analyst</th>
                  <th className="pb-2 text-right">Games</th>
                  <th className="pb-2 text-right">Hours</th>
                  <th className="pb-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {report.topAnalystsByGames.map((a) => (
                  <tr key={a.name} className="border-t border-slate-100">
                    <td className="py-1.5 font-medium text-slate-800">{a.name}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-800">
                      {a.games}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">
                      {hours(a.hours)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">
                      {money(a.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="mt-4 text-xs text-slate-400">
            Generated {new Date().toLocaleString("en-AU")}. Labour figures from
            Deputy shift records; games from coded match allocations. Shared,
            jointly-coded work (&ldquo;Premier Data&rdquo;) is excluded from
            per-analyst totals. Australia cost per game = Home + Office analyst
            coding cost ÷ AUS games only. Philippines is a fixed cost of{" "}
            {money(3800)}/week ({report.weeksInRange.toFixed(1)} weeks ={" "}
            {money(report.phlFixedCost)} this period) ÷ PHL games only — it is
            not part of the Deputy labour totals above.
          </p>
        </div>
      )}

      {!report && !loading && (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
          Pick a month or date range above and click{" "}
          <span className="font-medium text-slate-700">Generate report</span> to
          build a summarised board report.
        </div>
      )}
    </div>
  );
}
