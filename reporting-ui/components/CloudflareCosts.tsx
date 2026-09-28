"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  parseCloudflareCosts,
  parseUsageDaily,
  usageByDayOfWeek,
  formatMoney,
  CLOUDFLARE_COST_COLUMNS,
  type CloudflareCostData,
  type CloudflareCostKey,
  type UsageDailyRow,
} from "@/lib/cloudflare/costs";

// Where the Cloudflare cost + daily-usage CSVs live (drop fresh exports here).
const CSV_URL = "/data/cloudflare_costs.csv";
const USAGE_CSV_URL = "/data/cloudflare_usage.csv";

// One colour per cost component (stacked cost bars).
const COST_COLORS: Record<CloudflareCostKey, string> = {
  serviceCost: "#6366f1", // indigo
  upsellService: "#0ea5e9", // sky
  excessData: "#f59e0b", // amber
  excessStorage: "#10b981", // emerald
};
const DATA_COLOR = "#334155"; // slate — data-transfer usage line
const STORAGE_COLOR = "#e11d48"; // rose — storage usage line

const fmtTB = (v: number) => `${v.toFixed(1)} TB`;

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

// One combined tooltip: total cost + derived usage (or "within allowance").
function CombinedTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload?: ChartRow }[];
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const components = CLOUDFLARE_COST_COLUMNS.filter((c) => row[c.key] > 0);
  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
        background: "#fff",
        fontSize: 12,
        padding: "10px 12px",
        minWidth: 200,
      }}
    >
      <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>
        {String(label)}
      </div>
      {/* Total, then the cost split. */}
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
        <span>Total cost</span>
        <span>{formatMoney(row.cost)}</span>
      </div>
      {components.map((c) => (
        <Line2
          key={c.key}
          color={COST_COLORS[c.key]}
          name={c.label}
          value={formatMoney(row[c.key])}
        />
      ))}
      {/* Usage lines. */}
      <div style={{ borderTop: "1px solid #f1f5f9", marginTop: 4, paddingTop: 4 }}>
        <Line2
          color={DATA_COLOR}
          name="Data transfer"
          value={row.dataTB != null ? fmtTB(row.dataTB) : `≤ ${row.dataLimit} TB`}
        />
        {row.dataPerDayTB != null && (
          <Line2
            color={DATA_COLOR}
            name="Avg data / day"
            value={`${row.dataPerDayTB.toFixed(1)} TB`}
          />
        )}
        <Line2
          color={STORAGE_COLOR}
          name="Storage"
          value={
            row.storageTB != null
              ? fmtTB(row.storageTB)
              : `≤ ${row.storageLimit} TB`
          }
        />
      </div>
    </div>
  );
}

function Line2({ color, name, value }: { color: string; name: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        color: "#475569",
        lineHeight: 1.6,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: color,
            display: "inline-block",
          }}
        />
        {name}
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

type ChartRow = {
  label: string;
  cost: number;
  dataTB: number | null;
  dataPerDayTB: number | null;
  storageTB: number | null;
  dataLimit: number;
  storageLimit: number;
} & Record<CloudflareCostKey, number>;

export default function CloudflareCosts() {
  const [data, setData] = useState<CloudflareCostData | null>(null);
  const [usageRows, setUsageRows] = useState<UsageDailyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Day-of-week chart month filter: "all" or a period label.
  const [dowPeriod, setDowPeriod] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(CSV_URL);
        if (!res.ok) throw new Error(`Could not load cost data (${res.status}).`);
        const text = await res.text();
        if (/^\s*</.test(text)) throw new Error("Cost data file not found.");
        // Daily usage sheet is best-effort: if present, exact per-period data
        // transfer is summed from it; if not, we fall back to excess-derived.
        let usageDaily: ReturnType<typeof parseUsageDaily> = [];
        try {
          const ures = await fetch(USAGE_CSV_URL);
          if (ures.ok) {
            const utext = await ures.text();
            if (!/^\s*</.test(utext)) usageDaily = parseUsageDaily(utext);
          }
        } catch {
          /* usage sheet optional */
        }
        if (cancelled) return;
        setData(parseCloudflareCosts(text, usageDaily));
        setUsageRows(usageDaily);
        setError(null);
      } catch (err: unknown) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load cost data."
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // One row per billed period: total cost (bars) + derived usage in TB (lines).
  const chartData = useMemo<ChartRow[]>(() => {
    if (!data) return [];
    return data.periods.map((p) => {
      // Prefer the EXACT data transfer from the usage sheet; fall back to the
      // excess-derived figure when the usage sheet doesn't cover the period.
      const dataTB =
        p.usage.dataActualTB != null
          ? p.usage.dataActualTB
          : p.usage.dataTB != null
            ? Number(p.usage.dataTB.toFixed(2))
            : null;
      return {
        label: p.label,
        cost: Number(p.total.toFixed(2)),
        serviceCost: Number(p.costs.serviceCost.toFixed(2)),
        upsellService: Number(p.costs.upsellService.toFixed(2)),
        excessData: Number(p.costs.excessData.toFixed(2)),
        excessStorage: Number(p.costs.excessStorage.toFixed(2)),
        dataTB,
        dataPerDayTB: p.usage.dataActualPerDayTB,
        storageTB:
          p.usage.storageTB != null
            ? Number(p.usage.storageTB.toFixed(2))
            : null,
        dataLimit: p.usage.tier.dataLimitTB,
        storageLimit: p.usage.tier.storageLimitTB,
      };
    });
  }, [data]);

  // Billing periods that can be used as a day-of-week filter (have a resolved
  // date window and daily usage). Newest first for the dropdown.
  const dowPeriodOptions = useMemo(() => {
    if (!data) return [];
    return data.periods
      .filter((p) => p.windowStart && p.windowEnd && p.usage.dataActualTB != null)
      .map((p) => ({ label: p.label, start: p.windowStart!, end: p.windowEnd! }))
      .reverse();
  }, [data]);

  // Average data transfer by day of week, optionally scoped to one billing
  // period, so the heaviest days stand out (overall or for a chosen month).
  const dowData = useMemo(() => {
    if (usageRows.length === 0) return [];
    const sel = dowPeriodOptions.find((o) => o.label === dowPeriod);
    const range = sel ? { start: sel.start, end: sel.end } : undefined;
    return usageByDayOfWeek(usageRows, range).map((d) => ({
      label: d.label.slice(0, 3),
      full: d.label,
      avgTB: Number(d.avgTB.toFixed(2)),
      maxTB: Number(d.maxTB.toFixed(2)),
      count: d.count,
    }));
  }, [usageRows, dowPeriod, dowPeriodOptions]);

  // The heaviest weekday, for the summary line.
  const peakDow = useMemo(
    () =>
      dowData.reduce(
        (best, d) => (d.avgTB > (best?.avgTB ?? -1) ? d : best),
        null as (typeof dowData)[number] | null
      ),
    [dowData]
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
        Loading Cloudflare cost data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <p className="font-semibold">Cloudflare cost data unavailable</p>
        <p className="mt-1">{error}</p>
        <p className="mt-2 text-amber-700">
          Save the Cloudflare cost export to{" "}
          <code className="rounded bg-amber-100 px-1">
            public/data/cloudflare_costs.csv
          </code>
          .
        </p>
      </div>
    );
  }

  if (!data || data.periods.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
        No billed Cloudflare periods in this export yet.
      </div>
    );
  }

  const periodCount = data.periods.length;
  const avgPerPeriod = data.grandTotal / (periodCount || 1);
  const first = data.periods[0];
  const last = data.periods[data.periods.length - 1];

  return (
    <div className="space-y-5">
      <p className="text-xs text-zinc-500">Figures in AUD (USD × 1.4)</p>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card
          title="Total cost"
          value={formatMoney(data.grandTotal)}
          sub={`${first.start} → ${last.end}`}
        />
        <Card
          title="Avg / month"
          value={formatMoney(avgPerPeriod)}
          sub={`${periodCount} billing periods`}
        />
        <Card
          title="Base subscription"
          value={formatMoney(data.baseTotal)}
          sub="fixed monthly plan"
        />
        <Card
          title="Usage-driven"
          value={formatMoney(data.excessTotal)}
          sub={`+${data.pctOverBase.toFixed(0)}% over base`}
        />
      </div>

      {/* ONE COMBINED CHART: cost (bars) + usage TB (lines) */}
      <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-zinc-800">
            Monthly cost vs usage
          </h3>
          <p className="text-sm text-zinc-500">
            Bars = cost per billing period, stacked by charge type (left axis).
            Lines = data transfer and storage in TB (right axis). A gap in the
            storage line = usage stayed within the included allowance that
            period, so the exact volume isn&apos;t billed.
          </p>
        </div>

        <div style={{ width: "100%", height: 400, minWidth: 0, overflow: "visible" }}>
          <ResponsiveContainer width="99%" height="100%">
            <ComposedChart data={chartData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                angle={-25}
                textAnchor="end"
                height={70}
              />
              {/* Left axis: cost (AUD) */}
              <YAxis
                yAxisId="cost"
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                }
              />
              {/* Right axis: usage (TB) */}
              <YAxis
                yAxisId="tb"
                orientation="right"
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v} TB`}
              />
              <Tooltip
                allowEscapeViewBox={{ x: false, y: true }}
                wrapperStyle={{ zIndex: 50 }}
                content={<CombinedTooltip />}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {CLOUDFLARE_COST_COLUMNS.map((c, i) => (
                <Bar
                  key={c.key}
                  yAxisId="cost"
                  dataKey={c.key}
                  name={c.label}
                  stackId="cost"
                  fill={COST_COLORS[c.key]}
                  radius={
                    i === CLOUDFLARE_COST_COLUMNS.length - 1
                      ? [6, 6, 0, 0]
                      : undefined
                  }
                  maxBarSize={54}
                />
              ))}
              <Line
                yAxisId="tb"
                type="monotone"
                dataKey="dataTB"
                name="Data transfer (TB)"
                stroke={DATA_COLOR}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                connectNulls={false}
              />
              <Line
                yAxisId="tb"
                type="monotone"
                dataKey="storageTB"
                name="Storage (TB)"
                stroke={STORAGE_COLOR}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SUPPORTING TABLE: the numbers behind the chart */}
      <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-lg font-semibold text-zinc-800">
          Billing periods
        </h3>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">Billing period</th>
                <th className="px-3 py-2 text-right">Data transfer</th>
                <th className="px-3 py-2 text-right">Data / day</th>
                <th className="px-3 py-2 text-right">Storage</th>
                <th className="px-3 py-2 text-right">Base</th>
                <th className="px-3 py-2 text-right">Usage-driven</th>
                <th className="px-3 py-2 text-right font-semibold text-zinc-700">
                  Total cost
                </th>
              </tr>
            </thead>
            <tbody>
              {data.periods.map((p, idx) => (
                <tr
                  key={p.label + idx}
                  className="border-t border-zinc-100 hover:bg-zinc-50"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-left font-medium text-zinc-800">
                    {p.label}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-700">
                    {p.usage.dataActualTB != null ? (
                      fmtTB(p.usage.dataActualTB)
                    ) : p.usage.dataTB != null ? (
                      <span title="Estimated from excess charges (no daily usage data for this period)">
                        {fmtTB(p.usage.dataTB)}*
                      </span>
                    ) : (
                      <span className="text-zinc-400">
                        ≤ {p.usage.tier.dataLimitTB} TB
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-600">
                    {p.usage.dataActualPerDayTB != null ? (
                      <span
                        title={`${p.usage.dataActualTB} TB over ${p.usage.dataActualDays} days`}
                      >
                        {p.usage.dataActualPerDayTB.toFixed(1)} TB
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-700">
                    {p.usage.storageTB != null ? (
                      fmtTB(p.usage.storageTB)
                    ) : (
                      <span className="text-zinc-400">
                        ≤ {p.usage.tier.storageLimitTB} TB
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-600">
                    {formatMoney(p.base)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-600">
                    {p.excess > 0 ? formatMoney(p.excess) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-zinc-800">
                    {formatMoney(p.total)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold text-zinc-800">
                <td className="px-3 py-2 text-left" colSpan={4}>
                  Total ({periodCount} periods)
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatMoney(data.baseTotal)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatMoney(data.excessTotal)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatMoney(data.grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          Allowances: 60 TB data / 40 TB storage up to 12 May, then 80 TB / 60
          TB. Excess billed at USD $94.891/TB (data) and $15/TB (storage).
        </p>
      </div>

      {/* AVERAGE DATA TRANSFER BY DAY OF WEEK */}
      {dowData.length > 0 && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-zinc-800">
                Data transfer by day of week
              </h3>
              <p className="text-sm text-zinc-500">
                Average TB transferred on each weekday
                {dowPeriod === "all" ? ", across all daily usage data" : ""}.{" "}
                {peakDow && (
                  <>
                    <span className="font-semibold text-zinc-700">
                      {peakDow.full}
                    </span>{" "}
                    is the heaviest ({peakDow.avgTB.toFixed(1)} TB/day avg).
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-zinc-500">Month</label>
              <select
                value={dowPeriod}
                onChange={(e) => setDowPeriod(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 outline-none transition hover:border-zinc-300 focus:border-indigo-500"
                aria-label="Filter day-of-week averages by billing period"
              >
                <option value="all">All periods</option>
                {dowPeriodOptions.map((o) => (
                  <option key={o.label} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ width: "100%", height: 300, minWidth: 0, overflow: "visible" }}>
            <ResponsiveContainer width="99%" height="100%">
              <ComposedChart data={dowData} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v} TB`}
                />
                <Tooltip
                  allowEscapeViewBox={{ x: false, y: true }}
                  wrapperStyle={{ zIndex: 50 }}
                  formatter={(value, name) => [
                    `${Number(value).toFixed(1)} TB`,
                    name === "avgTB" ? "Avg / day" : "Peak day",
                  ]}
                  labelFormatter={(l, p) =>
                    (p?.[0]?.payload as { full?: string })?.full ?? String(l)
                  }
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    fontSize: 12,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(name) => (name === "avgTB" ? "Avg / day" : "Peak day")}
                />
                <Bar
                  dataKey="avgTB"
                  name="avgTB"
                  fill={DATA_COLOR}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
                <Line
                  type="monotone"
                  dataKey="maxTB"
                  name="maxTB"
                  stroke={STORAGE_COLOR}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            Bars = average TB on that weekday. Line = the single heaviest day
            seen for that weekday.
          </p>
        </div>
      )}
    </div>
  );
}
