"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  parseAwsCostRows,
  buildAwsCostData,
  bucketize,
  bucketizeByCategory,
  formatMoney,
  MIN_AVG_COST_PER_DAY,
  USD_TO_AUD,
  type AwsCostData,
  type Granularity,
  type RawDailyRow,
} from "@/lib/aws/costs";
import { getAwsCostCategories } from "@/lib/api/awsCostCategories";

// Where the exported AWS Cost Explorer CSV lives (drop a fresh export here to
// update the dashboard). See public/data/aws-costs-README.md.
const CSV_URL = "/data/aws-costs.csv";

// A fixed palette for stacked series (usage types or categories). Anything
// beyond these (for usage types) rolls into a single grey "Other" series so the
// chart stays readable. Categories are always drawn in full.
const SERIES_COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#8b5cf6", // violet
  "#22c55e", // green
  "#eab308", // yellow
];
const OTHER_COLOR = "#94a3b8"; // slate-400
const MAX_USAGE_SERIES = 8;

type Grouping = "category" | "usageType";

// A fuller bucket label for the table (e.g. "Wednesday, 1 October 2025" for a
// month, "1 Oct 2025" for a day, "Fri 3 Oct – Thu 9 Oct" style for a week).
// `key` is the bucket key: ISO date (daily), Friday ISO (weekly), or "YYYY-MM"
// (monthly). `fallback` is the short label already computed by the aggregator.
function fullBucketLabel(
  key: string,
  granularity: Granularity,
  fallback: string
): string {
  if (granularity === "monthly") {
    const m = key.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
      return d.toLocaleDateString("en-AU", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  }
  if (granularity === "daily" && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const d = new Date(key + "T00:00:00Z");
    return d.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  // Weekly: keep the range fallback (already "Fri – Thu").
  return fallback;
}

// Internal chart-row field names (prefixed to avoid clashing with series keys).
const TOTAL_FIELD = "__total__";
const FULL_LABEL_FIELD = "__fullLabel__";

// Custom tooltip: shows the bucket's full label, a bolded TOTAL for the
// column, then each stacked series. Rendered as our own element (not the
// default) so we can add the total line and control styling.
function CostTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: { name?: string | number; value?: number | string }[];
  label?: string | number;
  series: { key: string; label: string; color: string }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const seriesLabel = (name: string) =>
    series.find((x) => x.key === name)?.label ?? name;
  const seriesColor = (name: string) =>
    series.find((x) => x.key === name)?.color ?? "#94a3b8";
  // The stacked total for this column = sum of every series value.
  const total = payload.reduce((a, p) => a + (Number(p.value) || 0), 0);
  // Show non-zero series, largest first.
  const rows = payload
    .map((p) => ({
      name: String(p.name),
      value: Number(p.value) || 0,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
        background: "#fff",
        fontSize: 12,
        padding: "10px 12px",
        maxHeight: 320,
        overflowY: "auto",
      }}
    >
      <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>
        {String(label)}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          fontWeight: 700,
          color: "#0f172a",
          borderBottom: "1px solid #f1f5f9",
          paddingBottom: 4,
          marginBottom: 4,
        }}
      >
        <span>Total</span>
        <span>{formatMoney(total)}</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.name}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            color: "#475569",
            lineHeight: 1.5,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: seriesColor(r.name),
                display: "inline-block",
              }}
            />
            {seriesLabel(r.name)}
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatMoney(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      <div className="mt-1 text-2xl font-bold text-zinc-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}

export default function AwsCosts() {
  // The dashboard reads daily cost data from the CSV in /public/data. We keep
  // the RAW rows (+ category map from Supabase / the CSV Category row) in state
  // and derive the filtered/aggregated `data` via useMemo, so the Year filter
  // can re-derive everything.
  const [rawRows, setRawRows] = useState<RawDailyRow[] | null>(null);
  const [csvCategoryByKey, setCsvCategoryByKey] = useState<Record<string, string>>({});
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [grouping, setGrouping] = useState<Grouping>("category");
  const [view, setView] = useState<"chart" | "table">("chart");
  // Year filter: "all" or a 4-digit year present in the data.
  const [yearFilter, setYearFilter] = useState<string>("all");
  // Optional date-range filter (ISO YYYY-MM-DD). Empty string = unset. Applied
  // together with the year filter (a row must satisfy both). Lets you scope the
  // dashboard to a specific span instead of a whole year / everything.
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  useEffect(() => {
    // `loading` is set inside the async callback (not synchronously in the
    // effect body) and only flipped false once loading settles.
    let cancelled = false;

    (async () => {
      setLoading(true);
      // Categories: usage-type → category mapping from Supabase (best-effort;
      // falls back to the CSV Category row / built-in map per header).
      const cats = await getAwsCostCategories().catch(
        () => ({}) as Record<string, string>
      );

      try {
        const res = await fetch(CSV_URL);
        if (!res.ok) throw new Error(`Could not load cost data (${res.status}).`);
        const text = await res.text();
        if (/^\s*</.test(text)) throw new Error("Cost data file not found.");
        if (cancelled) return;
        const parsed = parseAwsCostRows(text);
        setRawRows(parsed.rows);
        setCsvCategoryByKey(parsed.csvCategoryByKey);
        setCategoryMap(cats);
        setError(null);
      } catch (err: unknown) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load cost data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Distinct calendar years present in the loaded data, newest first.
  const availableYears = useMemo(() => {
    if (!rawRows) return [];
    const set = new Set<string>();
    for (const r of rawRows) set.add(r.day.slice(0, 4));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rawRows]);

  // Earliest / latest day present in the data (ISO), used to bound the
  // date-range inputs so you can't pick outside the loaded range.
  const dataBounds = useMemo(() => {
    if (!rawRows || rawRows.length === 0) return { min: "", max: "" };
    let min = rawRows[0].day;
    let max = rawRows[0].day;
    for (const r of rawRows) {
      if (r.day < min) min = r.day;
      if (r.day > max) max = r.day;
    }
    return { min, max };
  }, [rawRows]);

  // Whether a date-range filter is active (either bound set).
  const dateRangeActive = startDate !== "" || endDate !== "";

  // The effective year: fall back to "all" if the selected year isn't present
  // (e.g. after an import changed the data). Clamped here rather than via an
  // effect so there's no cascading setState.
  const effectiveYear =
    yearFilter !== "all" && !availableYears.includes(yearFilter)
      ? "all"
      : yearFilter;

  // Derive the filtered, aggregated dashboard data. The Year filter scopes the
  // raw rows before aggregation, so KPIs, chart, tables and category rollups
  // all reflect the selected year.
  const data: AwsCostData | null = useMemo(() => {
    if (!rawRows) return null;
    // Apply the year filter and the optional date range together. `day` is ISO
    // (YYYY-MM-DD) so lexicographic comparison is a correct date comparison.
    const scoped = rawRows.filter((r) => {
      if (effectiveYear !== "all" && !r.day.startsWith(effectiveYear))
        return false;
      if (startDate && r.day < startDate) return false;
      if (endDate && r.day > endDate) return false;
      return true;
    });
    return buildAwsCostData(scoped, categoryMap, csvCategoryByKey);
  }, [rawRows, effectiveYear, startDate, endDate, categoryMap, csvCategoryByKey]);

  // Build the stacked chart data + series for the active grouping.
  const { chartData, series } = useMemo(() => {
    const empty = {
      chartData: [] as Record<string, number | string>[],
      series: [] as { key: string; label: string; color: string }[],
    };
    if (!data) return empty;

    if (grouping === "category") {
      const buckets = bucketizeByCategory(data, granularity);
      const series = data.categories.map((c, i) => ({
        key: c.category,
        label: c.category,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      }));
      const chartData = buckets.map((b) => {
        const row: Record<string, number | string> = {
          label: b.label,
          [FULL_LABEL_FIELD]: fullBucketLabel(b.key, granularity, b.label),
        };
        let total = 0;
        for (const c of data.categories) {
          const amt = b.byCategory[c.category] ?? 0;
          row[c.category] = Number(amt.toFixed(2));
          total += amt;
        }
        row[TOTAL_FIELD] = Number(total.toFixed(2));
        return row;
      });
      return { chartData, series };
    }

    // By usage type: top N as their own series, the rest into "Other".
    const buckets = bucketize(data, granularity);
    const topSet = new Set(
      data.usageTypes.slice(0, MAX_USAGE_SERIES).map((u) => u.key)
    );
    const hasOther = data.usageTypes.length > MAX_USAGE_SERIES;
    const series = data.usageTypes.slice(0, MAX_USAGE_SERIES).map((u, i) => ({
      key: u.key,
      label: u.label,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
    }));
    if (hasOther) series.push({ key: "__other__", label: "Other", color: OTHER_COLOR });

    const chartData = buckets.map((b) => {
      const row: Record<string, number | string> = {
        label: b.label,
        [FULL_LABEL_FIELD]: fullBucketLabel(b.key, granularity, b.label),
      };
      let other = 0;
      let total = 0;
      for (const [k, amt] of Object.entries(b.byUsageType)) {
        total += amt;
        if (topSet.has(k)) row[k] = Number(amt.toFixed(2));
        else other += amt;
      }
      if (hasOther) row["__other__"] = Number(other.toFixed(2));
      row[TOTAL_FIELD] = Number(total.toFixed(2));
      return row;
    });
    return { chartData, series };
  }, [data, granularity, grouping]);

  // Per-category table rows.
  const categoryRows = useMemo(() => {
    if (!data) return [];
    const dayCount = data.days.length || 1;
    return data.categories.map((c) => ({
      key: c.category,
      label: c.category,
      total: c.total,
      avgPerDay: c.avgPerDay,
      avgPerWeek: (c.total / dayCount) * 7,
      avgPerMonth: (c.total / dayCount) * (365 / 12),
      count: c.usageTypeKeys.length,
    }));
  }, [data]);

  // Per-usage-type table rows (with their category shown).
  const usageRows = useMemo(() => {
    if (!data) return [];
    const dayCount = data.days.length || 1;
    return data.usageTypes.map((u) => ({
      key: u.key,
      label: u.label,
      category: u.category ?? "—",
      total: u.total,
      avgPerDay: u.avgPerDay,
      avgPerMonth: (u.total / dayCount) * (365 / 12),
    }));
  }, [data]);

  const granLabel: Record<Granularity, string> = {
    daily: "Daily",
    weekly: "Weekly (Fri–Thu)",
    monthly: "Monthly",
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
        Loading AWS cost data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <p className="font-semibold">AWS cost data unavailable</p>
        <p className="mt-1">{error}</p>
        <p className="mt-2 text-amber-700">
          Export “Cost by Usage Type” (daily) from AWS Cost Explorer and save it
          to <code className="rounded bg-amber-100 px-1">public/data/aws-costs.csv</code>.
        </p>
      </div>
    );
  }

  if (!data || data.usageTypes.length === 0) {
    const filtered = effectiveYear !== "all" || dateRangeActive;
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
        {filtered ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              No usage types average at least{" "}
              {formatMoney(MIN_AVG_COST_PER_DAY)} per day for the selected{" "}
              {dateRangeActive ? "date range" : "year"}.
            </span>
            <button
              onClick={() => {
                setYearFilter("all");
                setStartDate("");
                setEndDate("");
              }}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            No usage types average at least {formatMoney(MIN_AVG_COST_PER_DAY)}{" "}
            per day in this export.
          </>
        )}
      </div>
    );
  }

  const firstDay = data.days[0];
  const lastDay = data.days[data.days.length - 1];
  const dayCount = data.days.length;
  const avgPerDay = data.grandTotal / (dayCount || 1);
  const uncategorisedTotal = data.grandTotal - data.categorisedTotal;

  return (
    <div className="space-y-5">
      {/* SOURCE + YEAR FILTER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Figures in AUD (USD × {USD_TO_AUD})
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* YEAR FILTER */}
          <label className="text-xs font-medium text-zinc-500">Year</label>
          <select
            value={effectiveYear}
            onChange={(e) => setYearFilter(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 outline-none transition hover:border-zinc-300 focus:border-indigo-500"
            aria-label="Filter by calendar year"
          >
            <option value="all">All years</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {/* DATE-RANGE FILTER */}
          <span className="ml-1 text-xs font-medium text-zinc-500">Dates</span>
          <input
            type="date"
            value={startDate}
            min={dataBounds.min || undefined}
            max={endDate || dataBounds.max || undefined}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 outline-none transition hover:border-zinc-300 focus:border-indigo-500"
            aria-label="From date"
          />
          <span className="text-xs text-zinc-400">to</span>
          <input
            type="date"
            value={endDate}
            min={startDate || dataBounds.min || undefined}
            max={dataBounds.max || undefined}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 outline-none transition hover:border-zinc-300 focus:border-indigo-500"
            aria-label="To date"
          />
          {dateRangeActive && (
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
              title="Clear the date range"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card
          title="Total cost (AUD)"
          value={formatMoney(data.grandTotal)}
          sub={`${firstDay} → ${lastDay} · USD × ${USD_TO_AUD}`}
        />
        <Card title="Avg / day" value={formatMoney(avgPerDay)} sub={`${dayCount} days`} />
        <Card
          title="Avg / month"
          value={formatMoney(avgPerDay * (365 / 12))}
          sub="≈ 30.4 days"
        />
        <Card
          title="Categories"
          value={String(data.categories.length)}
          sub={`${data.usageTypes.length} usage types`}
        />
      </div>

      {/* COST OVER TIME */}
      <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-800">Cost over time</h3>
            <p className="text-sm text-zinc-500">
              {granLabel[granularity]} spend, stacked by{" "}
              {grouping === "category" ? "category" : `usage type (top ${MAX_USAGE_SERIES} + Other)`}
              . Usage types under {formatMoney(MIN_AVG_COST_PER_DAY)}/day are excluded.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* GROUPING TOGGLE */}
            <div className="inline-flex rounded-lg bg-zinc-100 p-1">
              {(["category", "usageType"] as Grouping[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGrouping(g)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    grouping === g
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {g === "category" ? "By category" : "By usage type"}
                </button>
              ))}
            </div>
            {/* GRANULARITY TOGGLE */}
            <div className="inline-flex rounded-lg bg-zinc-100 p-1">
              {(["daily", "weekly", "monthly"] as Granularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    granularity === g
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {g === "weekly" ? "Weekly" : g === "monthly" ? "Monthly" : "Daily"}
                </button>
              ))}
            </div>
            {/* CHART / TABLE TOGGLE */}
            <div className="inline-flex rounded-lg bg-zinc-100 p-1">
              {(["chart", "table"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    view === v
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {v === "chart" ? "Chart" : "Table"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {view === "table" ? (
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">
                    {granularity === "monthly"
                      ? "Month"
                      : granularity === "weekly"
                        ? "Week"
                        : "Day"}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-zinc-700">
                    Total costs
                  </th>
                  {series.map((s) => (
                    <th key={s.key} className="px-3 py-2 text-right" title={s.label}>
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, idx) => (
                  <tr
                    key={String(row.label) + idx}
                    className="border-t border-zinc-100 hover:bg-zinc-50"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-left font-medium text-zinc-800">
                      {String(row[FULL_LABEL_FIELD] ?? row.label)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-zinc-800">
                      {formatMoney(Number(row[TOTAL_FIELD]) || 0)}
                    </td>
                    {series.map((s) => (
                      <td
                        key={s.key}
                        className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-600"
                      >
                        {formatMoney(Number(row[s.key]) || 0)}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold text-zinc-800">
                  <td className="px-3 py-2 text-left">Total</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatMoney(
                      chartData.reduce((a, r) => a + (Number(r[TOTAL_FIELD]) || 0), 0)
                    )}
                  </td>
                  {series.map((s) => (
                    <td
                      key={s.key}
                      className="whitespace-nowrap px-3 py-2 text-right tabular-nums"
                    >
                      {formatMoney(
                        chartData.reduce((a, r) => a + (Number(r[s.key]) || 0), 0)
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
        <div style={{ width: "100%", height: 380, minWidth: 0, overflow: "visible" }}>
          <ResponsiveContainer width="99%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                interval={granularity === "daily" ? Math.ceil(chartData.length / 15) : 0}
                angle={-25}
                textAnchor="end"
                height={70}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  `A$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                }
              />
              <Tooltip
                // Let the tooltip render outside the plot area so it isn't
                // clipped by the container / hidden behind the x-axis labels.
                allowEscapeViewBox={{ x: false, y: true }}
                wrapperStyle={{ zIndex: 50 }}
                content={<CostTooltip series={series} />}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(name) =>
                  series.find((x) => x.key === String(name))?.label ?? String(name)
                }
              />
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId="cost"
                  fill={s.color}
                  radius={i === series.length - 1 ? [6, 6, 0, 0] : undefined}
                  maxBarSize={60}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      {/* COST BY CATEGORY */}
      <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-lg font-semibold text-zinc-800">Cost by category</h3>
        <p className="mb-4 text-sm text-zinc-500">
          Usage types summed into your categories. Anything without a mapped
          category (Tax, Support, etc.) rolls into “Other”.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">Usage types</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Avg / day</th>
                <th className="px-3 py-2 text-right">Avg / week</th>
                <th className="px-3 py-2 text-right">Avg / month</th>
                <th className="px-3 py-2 text-right">% of total</th>
              </tr>
            </thead>
            <tbody>
              {categoryRows.map((r) => (
                <tr key={r.key} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="px-3 py-2 font-medium text-zinc-800">{r.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                    {r.count}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700">
                    {formatMoney(r.total)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {formatMoney(r.avgPerDay)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {formatMoney(r.avgPerWeek)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {formatMoney(r.avgPerMonth)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                    {((r.total / data.grandTotal) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
              {uncategorisedTotal > 0.005 && (
                <tr className="border-t border-zinc-100 text-zinc-400">
                  <td className="px-3 py-2 italic">Uncategorised</td>
                  <td className="px-3 py-2 text-right tabular-nums">—</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(uncategorisedTotal)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(uncategorisedTotal / dayCount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney((uncategorisedTotal / dayCount) * 7)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney((uncategorisedTotal / dayCount) * (365 / 12))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {((uncategorisedTotal / data.grandTotal) * 100).toFixed(1)}%
                  </td>
                </tr>
              )}
              <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold text-zinc-800">
                <td className="px-3 py-2">Total ({categoryRows.length} categories)</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {data.usageTypes.length}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(data.grandTotal)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(avgPerDay)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(avgPerDay * 7)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(avgPerDay * (365 / 12))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* USAGE TYPE BREAKDOWN */}
      <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-lg font-semibold text-zinc-800">
          Cost by usage type
        </h3>
        <p className="mb-4 text-sm text-zinc-500">
          Whole-period totals for usage types averaging at least{" "}
          {formatMoney(MIN_AVG_COST_PER_DAY)} per day.
        </p>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Usage type</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Avg / day</th>
                <th className="px-3 py-2 text-right">Avg / month</th>
                <th className="px-3 py-2 text-right">% of total</th>
              </tr>
            </thead>
            <tbody>
              {usageRows.map((r) => (
                <tr key={r.key} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="px-3 py-2 font-medium text-zinc-800">{r.label}</td>
                  <td className="px-3 py-2 text-zinc-500">{r.category}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700">
                    {formatMoney(r.total)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {formatMoney(r.avgPerDay)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {formatMoney(r.avgPerMonth)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                    {((r.total / data.grandTotal) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold text-zinc-800">
                <td className="px-3 py-2" colSpan={2}>
                  Total ({usageRows.length} usage types)
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(data.grandTotal)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(avgPerDay)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(avgPerDay * (365 / 12))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
