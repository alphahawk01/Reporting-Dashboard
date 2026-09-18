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
  parseAwsCosts,
  bucketize,
  bucketizeByCategory,
  formatMoney,
  MIN_AVG_COST_PER_DAY,
  USD_TO_AUD,
  type AwsCostData,
  type Granularity,
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
  const [csvText, setCsvText] = useState<string | null>(null);
  // Usage-type → category mapping from Supabase (empty until loaded; the parser
  // falls back to its built-in map per header when a key is missing).
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [grouping, setGrouping] = useState<Grouping>("category");

  useEffect(() => {
    // `loading` already starts true; the effect only flips it false when both
    // the CSV fetch and the category lookup settle, so there's no synchronous
    // setState in the effect body.
    let cancelled = false;
    const csvPromise = fetch(CSV_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load cost data (${res.status}).`);
        return res.text();
      })
      .then((text) => {
        // A stray HTML response (e.g. 404 page) isn't a CSV — guard against it.
        if (/^\s*</.test(text)) throw new Error("Cost data file not found.");
        return text;
      });

    // Categories are best-effort: on failure we fall back to the built-in map.
    const catPromise = getAwsCostCategories().catch(() => ({}) as Record<string, string>);

    Promise.all([csvPromise, catPromise])
      .then(([text, cats]) => {
        if (cancelled) return;
        setCsvText(text);
        setCategoryMap(cats);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load cost data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const data: AwsCostData | null = useMemo(
    () => (csvText ? parseAwsCosts(csvText, categoryMap) : null),
    [csvText, categoryMap]
  );

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
        const row: Record<string, number | string> = { label: b.label };
        for (const c of data.categories)
          row[c.category] = Number((b.byCategory[c.category] ?? 0).toFixed(2));
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
      const row: Record<string, number | string> = { label: b.label };
      let other = 0;
      for (const [k, amt] of Object.entries(b.byUsageType)) {
        if (topSet.has(k)) row[k] = Number(amt.toFixed(2));
        else other += amt;
      }
      if (hasOther) row["__other__"] = Number(other.toFixed(2));
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
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
        No usage types average at least {formatMoney(MIN_AVG_COST_PER_DAY)} per
        day in this export.
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
          </div>
        </div>

        <div style={{ width: "100%", height: 380, minWidth: 0, overflow: "hidden" }}>
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
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
                  fontSize: 12,
                }}
                formatter={(value, name) => {
                  const s = series.find((x) => x.key === String(name));
                  return [formatMoney(Number(value) || 0), s?.label ?? String(name)];
                }}
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
      </div>

      {/* COST BY CATEGORY */}
      <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-lg font-semibold text-zinc-800">Cost by category</h3>
        <p className="mb-4 text-sm text-zinc-500">
          Usage types summed into your categories. Uncategorised usage types are
          excluded here (shown in the usage-type table below).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">Usage types</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Avg / day</th>
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
