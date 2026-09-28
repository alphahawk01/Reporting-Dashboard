// Cloudflare cost data parsing.
//
// The export (public/data/cloudflare_costs.csv) is a simple per-billing-period
// table — one row per monthly billing window ("Start" -> "End", e.g.
// "13-Dec" -> "12-Jan"), with cost columns:
//   Service Cost, Upsel Service, Excess Data, Excess Storage, Total Cost
//
// Amounts are formatted strings like " $4,800.00 " or " $-   " (a dash =
// zero / not yet billed). Trailing blank rows are ignored.
//
// Cloudflare bills in USD; the dashboard shows AUD, matching the AWS tab. Every
// amount is multiplied by this rate at parse time, so all downstream totals,
// charts and tables are already in AUD. Update this to re-rate.
export const CLOUDFLARE_RATE = 1.4;

// The cost columns that make up a period, in display order. `Total Cost` is
// read separately (and cross-checked against the sum of the components).
export const CLOUDFLARE_COST_COLUMNS = [
  { key: "serviceCost", label: "Service Cost", header: "Service Cost" },
  { key: "upsellService", label: "Upsell Service", header: "Upsel Service" },
  { key: "excessData", label: "Excess Data", header: "Excess Data" },
  { key: "excessStorage", label: "Excess Storage", header: "Excess Storage" },
] as const;

export type CloudflareCostKey =
  (typeof CLOUDFLARE_COST_COLUMNS)[number]["key"];

// ── Usage pricing tiers ────────────────────────────────────────────────────
// The CSV only records COSTS, not usage volumes. But the excess charges let us
// DERIVE usage: usage over the included allowance = excess$ / per-TB rate, so
// total usage = allowance + (excess$ / rate). Rates/limits below are in USD/TB
// (the CSV amounts are USD; the dashboard converts to AUD for display only —
// usage derivation uses the raw USD excess, so it happens before rate-adjust).
//
// Pricing changed over time, so tiers are effective-dated by the period's
// START month. `startMonths` lists which billing-window start months use the
// tier (the CSV windows are "13-<Mon>" -> "12-<nextMon>").
//   Tier 1 (up to the 13-Apr window): 60 TB data @ $94.891, 40 TB storage @ $15
//   Tier 2 (from the 13-May window on): 80 TB data @ $94.891, 60 TB storage @ $15
export type UsageTier = {
  dataLimitTB: number;
  dataRateUsdPerTB: number;
  storageLimitTB: number;
  storageRateUsdPerTB: number;
};

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Start months (of the billing window) that belong to Tier 1. The fiscal
// window runs Dec→Nov; Dec/Jan/Feb/Mar/Apr windows are Tier 1, May→Nov Tier 2.
const TIER1_START_MONTHS = new Set([12, 1, 2, 3, 4]);
const TIER1: UsageTier = {
  dataLimitTB: 60,
  dataRateUsdPerTB: 94.891,
  storageLimitTB: 40,
  storageRateUsdPerTB: 15,
};
const TIER2: UsageTier = {
  dataLimitTB: 80,
  dataRateUsdPerTB: 94.891,
  storageLimitTB: 60,
  storageRateUsdPerTB: 15,
};

function startMonthOf(start: string): number {
  const m = start.toLowerCase().match(/(\d{1,2})-([a-z]{3})/);
  return m ? MONTH_INDEX[m[2]] ?? 0 : 0;
}

function tierFor(start: string): UsageTier {
  return TIER1_START_MONTHS.has(startMonthOf(start)) ? TIER1 : TIER2;
}

// Derived usage for a period. When there's no excess charge the exact usage is
// unknown (it was at or below the included allowance) — `null` means "≤ limit".
export type CloudflareUsage = {
  tier: UsageTier;
  /** Data transferred (TB) — null when at/below the allowance. */
  dataTB: number | null;
  /** Storage used (TB) — null when at/below the allowance. */
  storageTB: number | null;
  /** TB of data over the included allowance (0 when none). */
  dataOverTB: number;
  /** TB of storage over the included allowance (0 when none). */
  storageOverTB: number;
  /**
   * EXACT data transfer (TB) for the period, summed from the daily usage sheet
   * over the 13th→12th billing window. Present only when the usage sheet
   * covers the period; preferred over the excess-derived `dataTB` for display.
   */
  dataActualTB: number | null;
  /** Number of days with usage data in the window (for the per-day average). */
  dataActualDays: number;
  /** Average data transfer per day (TB) across the window, or null. */
  dataActualPerDayTB: number | null;
};

// ── Usage sheet (daily data transfer) ──────────────────────────────────────
// public/data/cloudflare_usage.csv is a DAILY data-transfer tracker:
//   DATE ("Wednesday, 1 April 2026"), DAILY (TB that day), MONTHLY, WEEKLY.
// We sum DAILY across each billing window (13th→12th) to get the exact data
// transfer per billing period, aligned to the cost periods.

export type UsageDailyRow = { date: Date; tb: number };

const USAGE_MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

// Short-month (Apr, May, …) index for the cost CSV's "13-Apr" style cells.
const SHORT_MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parse the daily usage CSV into { date, tb } rows (blank days skipped). */
export function parseUsageDaily(csvText: string): UsageDailyRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const out: UsageDailyRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    const dateStr = (cells[0] ?? "").trim();
    const dailyStr = (cells[1] ?? "").trim();
    // "Wednesday, 1 April 2026" -> day / month / year.
    const m = dateStr.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (!m) continue;
    const day = Number(m[1]);
    const mo = USAGE_MONTHS[m[2].toLowerCase()];
    const year = Number(m[3]);
    if (mo == null || !Number.isFinite(day) || !Number.isFinite(year)) continue;
    if (dailyStr === "") continue; // no usage recorded that day
    const tb = Number(dailyStr);
    if (!Number.isFinite(tb)) continue;
    out.push({ date: new Date(Date.UTC(year, mo, day)), tb });
  }
  return out;
}

// Average daily data transfer BY DAY OF WEEK, so the weekly pattern (which days
// move the most data) is visible. Computed from the daily usage sheet.
export type DayOfWeekUsage = {
  /** 0 = Sunday … 6 = Saturday. */
  dow: number;
  label: string;
  /** Number of that weekday present in the data. */
  count: number;
  /** Total TB across those days. */
  totalTB: number;
  /** Average TB on that weekday. */
  avgTB: number;
  /** Peak single-day TB seen on that weekday. */
  maxTB: number;
};

const DOW_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Aggregate daily usage rows into a per-weekday average. Returns 7 entries
 * (Mon-first for display order) with count / total / average / peak TB.
 * `range` optionally restricts to [start, end] (e.g. one billing period).
 */
export function usageByDayOfWeek(
  rows: UsageDailyRow[],
  range?: { start: Date; end: Date }
): DayOfWeekUsage[] {
  const acc = DOW_LABELS.map((label, dow) => ({
    dow,
    label,
    count: 0,
    totalTB: 0,
    avgTB: 0,
    maxTB: 0,
  }));
  for (const r of rows) {
    if (range && (r.date < range.start || r.date > range.end)) continue;
    const dow = r.date.getUTCDay();
    const e = acc[dow];
    e.count += 1;
    e.totalTB += r.tb;
    if (r.tb > e.maxTB) e.maxTB = r.tb;
  }
  for (const e of acc) {
    e.avgTB = e.count > 0 ? e.totalTB / e.count : 0;
  }
  // Display Monday → Sunday (shift Sunday to the end).
  return [...acc.slice(1), acc[0]];
}

// Sum daily usage TB within [start, end] inclusive (UTC dates), plus the
// number of days that had a usage figure (for a per-day average).
function sumUsageInWindow(
  rows: UsageDailyRow[],
  start: Date,
  end: Date
): { sum: number; days: number } {
  let sum = 0;
  let days = 0;
  for (const r of rows) {
    if (r.date >= start && r.date <= end) {
      sum += r.tb;
      days += 1;
    }
  }
  return { sum, days };
}

// Resolve a billing period's "13-Apr" / "12-May" start/end cells into actual
// UTC dates. The cost CSV has no year, so we infer it from the usage sheet's
// date span: pick the year in that span whose (month, day) matches the start
// cell. The end is start's day/month advanced to the "12-<nextMonth>" cell,
// rolling the year over December→January.
function billingWindow(
  startCell: string,
  endCell: string,
  usageRows: UsageDailyRow[]
): { start: Date; end: Date } | null {
  const parseCell = (cell: string): { day: number; mo: number } | null => {
    const m = cell.toLowerCase().match(/(\d{1,2})-([a-z]{3})/);
    if (!m) return null;
    const mo = SHORT_MONTHS[m[2]];
    if (mo == null) return null;
    return { day: Number(m[1]), mo };
  };
  const s = parseCell(startCell);
  const e = parseCell(endCell);
  if (!s || !e) return null;

  const years = usageRows.map((r) => r.date.getUTCFullYear());
  const minY = Math.min(...years);
  const maxY = Math.max(...years);

  // Find the year in [minY-1, maxY+1] whose start (mo, day) sits within/near the
  // usage span. Prefer the candidate whose window overlaps the usage rows.
  for (let y = minY - 1; y <= maxY + 1; y++) {
    const start = new Date(Date.UTC(y, s.mo, s.day));
    // End month rolls to next year when it wraps past December.
    const endYear = e.mo < s.mo ? y + 1 : y;
    const end = new Date(Date.UTC(endYear, e.mo, e.day));
    // Accept the first window that actually contains any usage rows.
    const hit = usageRows.some((r) => r.date >= start && r.date <= end);
    if (hit) return { start, end };
  }
  return null;
}

// One billing period's parsed costs.
export type CloudflarePeriod = {
  /** Raw "Start" cell, e.g. "13-Dec". */
  start: string;
  /** Raw "End" cell, e.g. "12-Jan". */
  end: string;
  /** "13 Dec – 12 Jan" style label for display. */
  label: string;
  /** Per-component costs (already rate-adjusted). */
  costs: Record<CloudflareCostKey, number>;
  /** Total for the period (from the Total Cost column, rate-adjusted). */
  total: number;
  /**
   * Fixed base subscription for the period (the Service Cost). This is the
   * cost you pay regardless of usage.
   */
  base: number;
  /**
   * Usage-driven charges on top of the base = Upsell + Excess Data + Excess
   * Storage. These only appear when usage exceeds the plan, so this is the
   * "usage" side of the usage↔cost relationship.
   */
  excess: number;
  /** Excess as a % of base — how much usage pushed the bill above the flat fee. */
  pctOverBase: number;
  /** Usage (TB) derived from the excess charges + the period's pricing tier. */
  usage: CloudflareUsage;
  /**
   * Resolved billing-window date range (from the usage sheet's span), or null
   * when it can't be resolved. Lets callers filter daily usage to this period.
   */
  windowStart: Date | null;
  windowEnd: Date | null;
};

export type CloudflareCostData = {
  /** Periods that have any cost (blank/zero future periods excluded). */
  periods: CloudflarePeriod[];
  /** All periods including zero ones (for a complete timeline if needed). */
  allPeriods: CloudflarePeriod[];
  /** Grand total across periods. */
  grandTotal: number;
  /** Per-component totals across all periods. */
  componentTotals: Record<CloudflareCostKey, number>;
  /** Total fixed base subscription across periods. */
  baseTotal: number;
  /** Total usage-driven (excess + upsell) charges across periods. */
  excessTotal: number;
  /** Usage-driven charges as a % of the base total across the whole period. */
  pctOverBase: number;
};

// Parse a " $4,800.00 " / " $-   " / "" money cell into a number. A lone dash
// or blank is 0.
export function parseMoneyCell(raw: string | undefined | null): number {
  if (raw == null) return 0;
  const s = raw.replace(/[",$\s]/g, "");
  if (s === "" || s === "-") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Split a CSV line honouring double-quoted fields (amounts are quoted because
// they contain commas, e.g. "$4,800.00").
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function formatMoney(v: number): string {
  return `$${Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}`;
}

/**
 * Parse the Cloudflare cost CSV into structured data. Rate-adjusts amounts by
 * CLOUDFLARE_RATE (1 by default). Blank trailing rows and zero-total future
 * periods are separated out (kept in `allPeriods`, excluded from `periods`).
 */
export function parseCloudflareCosts(
  csvText: string,
  usageDaily?: UsageDailyRow[]
): CloudflareCostData {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      periods: [],
      allPeriods: [],
      grandTotal: 0,
      componentTotals: {
        serviceCost: 0,
        upsellService: 0,
        excessData: 0,
        excessStorage: 0,
      },
      baseTotal: 0,
      excessTotal: 0,
      pctOverBase: 0,
    };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h === name);
  const startIdx = idx("Start");
  const endIdx = idx("End");
  const totalIdx = idx("Total Cost");
  const colIdx: Record<CloudflareCostKey, number> = {
    serviceCost: idx("Service Cost"),
    upsellService: idx("Upsel Service"),
    excessData: idx("Excess Data"),
    excessStorage: idx("Excess Storage"),
  };

  const allPeriods: CloudflarePeriod[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    const start = (cells[startIdx] ?? "").trim();
    const end = (cells[endIdx] ?? "").trim();
    // Skip completely blank rows (no start/end).
    if (!start && !end) continue;

    // Raw USD amounts (used for usage derivation, which is priced in USD/TB).
    const usdServiceCost = parseMoneyCell(cells[colIdx.serviceCost]);
    const usdUpsell = parseMoneyCell(cells[colIdx.upsellService]);
    const usdExcessData = parseMoneyCell(cells[colIdx.excessData]);
    const usdExcessStorage = parseMoneyCell(cells[colIdx.excessStorage]);

    const costs = {
      serviceCost: usdServiceCost * CLOUDFLARE_RATE,
      upsellService: usdUpsell * CLOUDFLARE_RATE,
      excessData: usdExcessData * CLOUDFLARE_RATE,
      excessStorage: usdExcessStorage * CLOUDFLARE_RATE,
    };

    // Derive usage (TB) from the raw USD excess and the period's pricing tier.
    const tier = tierFor(start);
    const dataOverTB =
      usdExcessData > 0 ? usdExcessData / tier.dataRateUsdPerTB : 0;
    const storageOverTB =
      usdExcessStorage > 0 ? usdExcessStorage / tier.storageRateUsdPerTB : 0;

    // Exact data transfer for the period, summed from the daily usage sheet
    // over this billing window (13th→12th). Only when the sheet covers it.
    let dataActualTB: number | null = null;
    let dataActualDays = 0;
    let windowStart: Date | null = null;
    let windowEnd: Date | null = null;
    if (usageDaily && usageDaily.length > 0) {
      const win = billingWindow(start, end, usageDaily);
      if (win) {
        windowStart = win.start;
        windowEnd = win.end;
        // Only trust the sum when the usage sheet FULLY covers the window —
        // i.e. there's data on/before the window start and on/after its end.
        // A partial window (e.g. the sheet starts mid-period) would otherwise
        // report a misleadingly low total.
        const minDate = usageDaily[0].date;
        const maxDate = usageDaily[usageDaily.length - 1].date;
        const fullyCovered = minDate <= win.start && maxDate >= win.end;
        if (fullyCovered) {
          const { sum, days } = sumUsageInWindow(usageDaily, win.start, win.end);
          if (sum > 0) {
            dataActualTB = Number(sum.toFixed(2));
            dataActualDays = days;
          }
        }
      }
    }

    const usage: CloudflareUsage = {
      tier,
      dataTB: dataOverTB > 0 ? tier.dataLimitTB + dataOverTB : null,
      storageTB: storageOverTB > 0 ? tier.storageLimitTB + storageOverTB : null,
      dataOverTB,
      storageOverTB,
      dataActualTB,
      dataActualDays,
      dataActualPerDayTB:
        dataActualTB != null && dataActualDays > 0
          ? Number((dataActualTB / dataActualDays).toFixed(3))
          : null,
    };
    // Prefer the CSV's Total Cost; fall back to the sum of components.
    const rawTotal = parseMoneyCell(cells[totalIdx]) * CLOUDFLARE_RATE;
    const componentSum =
      costs.serviceCost +
      costs.upsellService +
      costs.excessData +
      costs.excessStorage;
    const total = rawTotal || componentSum;

    const base = costs.serviceCost;
    const excess =
      costs.upsellService + costs.excessData + costs.excessStorage;

    allPeriods.push({
      start,
      end,
      label: start && end ? `${start} – ${end}` : start || end,
      costs,
      total,
      base,
      excess,
      pctOverBase: base > 0 ? (excess / base) * 100 : 0,
      usage,
      windowStart,
      windowEnd,
    });
  }

  const periods = allPeriods.filter((p) => p.total > 0);

  const componentTotals: Record<CloudflareCostKey, number> = {
    serviceCost: 0,
    upsellService: 0,
    excessData: 0,
    excessStorage: 0,
  };
  let grandTotal = 0;
  let baseTotal = 0;
  let excessTotal = 0;
  for (const p of periods) {
    grandTotal += p.total;
    baseTotal += p.base;
    excessTotal += p.excess;
    componentTotals.serviceCost += p.costs.serviceCost;
    componentTotals.upsellService += p.costs.upsellService;
    componentTotals.excessData += p.costs.excessData;
    componentTotals.excessStorage += p.costs.excessStorage;
  }

  return {
    periods,
    allPeriods,
    grandTotal,
    componentTotals,
    baseTotal,
    excessTotal,
    pctOverBase: baseTotal > 0 ? (excessTotal / baseTotal) * 100 : 0,
  };
}
