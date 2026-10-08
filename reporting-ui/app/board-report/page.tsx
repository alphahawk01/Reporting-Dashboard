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

import { useCallback, useMemo, useState } from "react";
import {
  FileText,
  Loader2,
  AlertTriangle,
  Printer,
  Download,
  CalendarRange,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  buildBoardReport,
  monthLabel,
  type BoardReport,
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

function reportToCsv(r: BoardReport): string {
  const lines: string[] = [];
  const row = (...cells: (string | number)[]) =>
    lines.push(cells.map(csvEscape).join(","));

  row("Premier Data — Board Report");
  row("Period", rangeLabel(r.from, r.to));
  row("");
  row("Headline");
  row("Total labour cost", Math.round(r.totalCost));
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

function downloadCsv(r: BoardReport) {
  const blob = new Blob([reportToCsv(r)], { type: "text/csv;charset=utf-8;" });
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

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
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

// ── Page ──────────────────────────────────────────────────────────────────────

type Mode = "month" | "range";

export default function BoardReportPage() {
  const months = useMemo(() => recentMonths(18), []);
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState<string>(lastMonthKey());
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const [report, setReport] = useState<BoardReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the active from/to from the current mode.
  const resolveRange = useCallback((): { from: string; to: string } | null => {
    if (mode === "month") {
      if (!month) return null;
      return monthBounds(month);
    }
    if (!customFrom || !customTo) return null;
    if (customFrom > customTo) return { from: customTo, to: customFrom };
    return { from: customFrom, to: customTo };
  }, [mode, month, customFrom, customTo]);

  const generate = useCallback(async () => {
    const range = resolveRange();
    if (!range) {
      setError("Pick a month, or a valid from/to date range.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [shifts, games] = await Promise.all([
        loadAll("deputy_shifts"),
        loadAll("TT_Games"),
      ]);
      const r = buildBoardReport(
        shifts as ShiftRow[],
        games as GameRow[],
        range.from,
        range.to
      );
      setReport(r);
    } catch (err) {
      console.error("Board report failed:", err);
      setError(
        err instanceof Error ? err.message : "Failed to build the board report."
      );
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [resolveRange]);

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
            A summarised view of workforce cost, hours and games for a month or
            custom date range. Built live from the platform&rsquo;s own data
            (Deputy shifts + games coded) — pick a period and generate.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            {/* Mode toggle */}
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Period type
              </label>
              <div className="inline-flex rounded-lg border border-slate-300 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("month")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    mode === "month"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setMode("range")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    mode === "range"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Date range
                </button>
              </div>
            </div>

            {mode === "month" ? (
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
            ) : (
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

            <button
              onClick={generate}
              disabled={loading}
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
                onClick={() => downloadCsv(report)}
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

          {/* Headline KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi label="Total labour cost" value={money(report.totalCost)} />
            <Kpi label="Total hours" value={hours(report.totalHours)} />
            <Kpi label="Games coded" value={report.totalGames.toLocaleString("en-AU")} />
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
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-900">
                      {report.ausGames > 0 ? money2(report.ausCostPerGame) : "—"}
                    </div>
                    <div className="text-xs text-blue-700">cost / game</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-900">
                      {report.ausGames > 0
                        ? report.ausHoursPerGame.toFixed(2)
                        : "—"}
                    </div>
                    <div className="text-xs text-blue-700">hours / game</div>
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
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-amber-900">
                      {report.phlGames > 0 ? money2(report.phlCostPerGame) : "—"}
                    </div>
                    <div className="text-xs text-amber-700">cost / game</div>
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
