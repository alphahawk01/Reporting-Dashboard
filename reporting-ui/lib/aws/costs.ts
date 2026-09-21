// Parsing + aggregation for the AWS Cost Explorer "cost by Usage Type" export.
//
// The CSV is a PIVOTED daily table:
//   - header row:  "Usage type", <usage type 1>, <usage type 2>, …, "Total costs($)"
//   - a "Usage type total" row: whole-period total per column (we ignore it and
//     recompute from the daily rows so the numbers always match what's shown).
//   - one row per calendar day: "YYYY-MM-DD", then that day's cost per usage type.
//
// AWS bills in USD; the dashboard shows AUD. Every amount parsed from the CSV
// is multiplied by this rate once (at parse time), so all downstream totals,
// averages, charts and tables are already in AUD. Update this to re-rate.
export const USD_TO_AUD = 1.4;

// The dashboard drops any usage type whose AVERAGE cost per day (over the days
// present in the file) is below this threshold. The threshold is applied to the
// CONVERTED (AUD) figures, i.e. AUD $0.50/day.
export const MIN_AVG_COST_PER_DAY = 0.5;

// Column headers that are not real usage types (the row label + the row total).
const TOTAL_COLUMN = "Total costs($)";
// The label of the whole-period total row (skipped during daily parsing).
const TOTAL_ROW_LABEL = "usage type total";

export type Granularity = "daily" | "weekly" | "monthly";

// Business-friendly category for each raw usage-type column, as supplied by the
// user's "Category" header row. Keyed by the EXACT column header (including the
// trailing "($)"). Usage types NOT in this map — or mapped to "" — are treated
// as Uncategorised and excluded from the category rollups (per requirement:
// "ignore the blank with no category"). They still appear in the per-usage-type
// view. Add new entries here when the export grows new usage types.
export const USAGE_TYPE_CATEGORY: Record<string, string> = {
  "APS2-EC2SP:c6a.1yrNoUpfront($)": "PD Database",
  "APS2-DataTransfer-Out-Bytes($)": "Data Transfer",
  "No usage type($)": "Tax",
  "APS2-EC2SP:r6a.1yrNoUpfront($)": "PD App",
  "APS2-EBS:SnapshotUsage($)": "Snapshot",
  "Dollar($)": "Support",
  "APS2-EBS:VolumeUsage.gp3($)": "Server Volume Drives",
  "APS2-TimedStorage-GDA-ByteHrs($)": "S3 Storage",
  "APS2-EC2SP:t2.1yrNoUpfront($)": "League App",
  "APS2-EBS:SnapshotArchiveStorage($)": "Snapshot",
  "EUW2-BoxUsage:c6a.4xlarge($)": "UK Server",
  "USE1-KiroEnterprise-Power($)": "Kiro",
  "APS2-BoxUsage:c6a.8xlarge($)": "PD Database",
  "APS2-BoxUsage:r6a.2xlarge($)": "PD App",
  "APS2-BoxUsage:t2.2xlarge($)": "League App",
  "APS2-TimedStorage-ByteHrs($)": "Deep Archive Storage",
  "APS2-BoxUsage:t3.2xlarge($)": "League App",
  "APS2-TimedStorage-INT-AIA-ByteHrs($)": "Deep Archive Storage",
  // APS2-RegionalNatGateway-Hours: blank category → Uncategorised (ignored).
  // APS2-BoxUsage:g4dn.xlarge: blank category → Uncategorised (ignored).
  "APS2-PublicIPv4:InUseAddress($)": "UK Server",
  "APS2-EBS:SnapshotArchiveEarlyDelete($)": "Snapshot",
  "APS2-BoxUsage:t3.small($)": "Opposition Analysis",
  "APS2-BoxUsage:t3.medium($)": "Opposition Analysis",
};

// Label used for usage types with no category. These are excluded from the
// category rollups but still shown in the per-usage-type breakdown.
export const UNCATEGORISED = "Uncategorised";

// Resolve a usage-type column header to its category, or null when it has no
// category (blank) and should be excluded from category rollups. An optional
// `override` map (e.g. loaded from Supabase) takes precedence over the built-in
// USAGE_TYPE_CATEGORY, which is used as a fallback when the override is absent
// or doesn't contain the header.
export function categoryFor(
  usageTypeKey: string,
  override?: Record<string, string>
): string | null {
  const c = override?.[usageTypeKey] ?? USAGE_TYPE_CATEGORY[usageTypeKey];
  return c && c.trim() ? c.trim() : null;
}

// One usage type's summary across the whole file.
export type UsageTypeSummary = {
  /** Raw column name, e.g. "APS2-EC2SP:c6a.1yrNoUpfront($)". */
  key: string;
  /** Cleaned display label (region prefix kept, trailing "($)" removed). */
  label: string;
  /** Category from the user's mapping, or null when uncategorised. */
  category: string | null;
  total: number;
  avgPerDay: number;
};

// A category's rolled-up summary (sum of its usage types) across the file.
export type CategorySummary = {
  category: string;
  total: number;
  avgPerDay: number;
  /** Raw usage-type keys that make up this category (kept types only). */
  usageTypeKeys: string[];
};

// A time bucket (a day, a Fri–Thu week, or a month) with its total cost and a
// per-usage-type breakdown (only the usage types that pass the filter).
export type CostBucket = {
  /** Sort/display key: "2025-09-17", week start "2025-09-19", or "2025-09". */
  key: string;
  /** Human label for the bucket. */
  label: string;
  /** Total cost across the kept usage types in this bucket. */
  total: number;
  /** Cost per kept usage type in this bucket (key -> amount). */
  byUsageType: Record<string, number>;
};

export type AwsCostData = {
  /** Days present in the file, ascending (ISO date strings). */
  days: string[];
  /** Usage types that passed the >= $0.50/day filter, biggest first. */
  usageTypes: UsageTypeSummary[];
  /**
   * Category rollups (sum of each category's kept usage types), biggest first.
   * Excludes uncategorised usage types.
   */
  categories: CategorySummary[];
  /** Per-day cost per kept usage type. day -> (usageTypeKey -> amount). */
  daily: Record<string, Record<string, number>>;
  /** Grand total across kept usage types over the whole period. */
  grandTotal: number;
  /** Total of KEPT usage types that have a category (excludes uncategorised). */
  categorisedTotal: number;
  /** How many usage types were dropped by the < $0.50/day filter. */
  droppedCount: number;
};

// Parse one CSV line into fields, honouring double-quoted values (which may
// contain commas). AWS wraps every field in double quotes.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++; // escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Turn a raw usage-type column header into a display label: drop the trailing
// "($)" that AWS appends. Region prefixes (APS2-, EUW2-, USE1-…) are kept as
// they're meaningful.
function cleanLabel(header: string): string {
  return header.replace(/\(\$\)\s*$/, "").trim();
}

// Accepted date-row formats: ISO (2026-09-16) and AWS/Excel DD/MM/YYYY
// (16/09/2026). Both are normalised to ISO so days sort and bucket correctly.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DMY_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

// Sanity window for AWS cost data — reject anything outside so a mis-parsed or
// wrong-format date can't silently enter the data set.
const MIN_YEAR = 2020;
const MAX_YEAR = 2035;

// Validate a YYYY-MM-DD string is a real calendar date within the sane window.
function isValidIsoDate(iso: string): boolean {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < MIN_YEAR || y > MAX_YEAR) return false;
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  // Reject impossible days (e.g. 31 Feb) by round-tripping through Date.
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

// Return the ISO date (YYYY-MM-DD) for a row label if it's a recognised, VALID
// date in the sane window, else null. Handles ISO and DD/MM/YYYY. Anything
// ambiguous or out of range is rejected (returns null) rather than guessed.
function normaliseDate(label: string): string | null {
  let iso: string | null = null;
  if (ISO_DATE_RE.test(label)) {
    iso = label;
  } else {
    const m = label.match(DMY_DATE_RE);
    if (m) iso = `${m[3]}-${m[2]}-${m[1]}`; // dd/mm/yyyy -> yyyy-mm-dd
  }
  return iso && isValidIsoDate(iso) ? iso : null;
}

// Label of the optional leading "Category" row (aligned to the usage-type
// columns). When present, its per-column values seed the category mapping.
const CATEGORY_ROW_LABEL = "category";
// Header label used by the usage-type header row (case-insensitive match).
const USAGE_TYPE_LABEL_LOWER = "usage type";

// One (day, usage type, amount) fact in USD — the normalised unit shared by the
// CSV parser and the Supabase-backed store. `day` is ISO (YYYY-MM-DD).
export type RawDailyRow = {
  day: string;
  usageType: string;
  amountUsd: number;
};

// The result of reading a raw AWS export: the daily facts (USD) plus any
// per-usage-type categories found in the CSV's optional "Category" row.
export type ParsedAwsCsv = {
  rows: RawDailyRow[];
  csvCategoryByKey: Record<string, string>;
};

/**
 * Extract raw (day, usage type, USD amount) rows from an AWS cost CSV, plus any
 * categories declared in the CSV's optional leading "Category" row. Does NO
 * filtering or currency conversion — used both for aggregation (via
 * buildAwsCostData) and for importing into Supabase.
 */
export function parseAwsCostRows(csvText: string): ParsedAwsCsv {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { rows: [], csvCategoryByKey: {} };

  // The export may start with an optional "Category" row (aligned to the
  // usage-type columns), followed by the "Usage type" header row.
  let headerIdx = 0;
  let csvCategoryRow: string[] | null = null;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cells = parseCsvLine(lines[i]);
    const first = (cells[0] ?? "").trim().toLowerCase();
    if (first === CATEGORY_ROW_LABEL) {
      csvCategoryRow = cells;
    } else if (first === USAGE_TYPE_LABEL_LOWER) {
      headerIdx = i;
      break;
    }
  }

  const header = parseCsvLine(lines[headerIdx]);
  const usageCols: { index: number; key: string }[] = [];
  for (let i = 0; i < header.length; i++) {
    const h = header[i].trim();
    if (i === 0 && h.toLowerCase() === USAGE_TYPE_LABEL_LOWER) continue;
    if (h === TOTAL_COLUMN) continue;
    usageCols.push({ index: i, key: h });
  }

  const csvCategoryByKey: Record<string, string> = {};
  if (csvCategoryRow) {
    for (const c of usageCols) {
      const cat = (csvCategoryRow[c.index] ?? "").trim();
      if (cat) csvCategoryByKey[c.key] = cat;
    }
  }

  const rows: RawDailyRow[] = [];
  for (let r = headerIdx + 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r]);
    const rowLabel = (cells[0] ?? "").trim();
    if (rowLabel.toLowerCase() === TOTAL_ROW_LABEL) continue;
    const day = normaliseDate(rowLabel);
    if (!day) continue;
    for (const c of usageCols) {
      const raw = cells[c.index];
      const v = raw == null || raw === "" ? 0 : Number(raw);
      const amountUsd = Number.isFinite(v) ? v : 0;
      // Skip zero cells to keep the row set small (missing == 0 downstream).
      if (amountUsd !== 0) rows.push({ day, usageType: c.key, amountUsd });
    }
  }

  return { rows, csvCategoryByKey };
}

/**
 * Build the filtered, aggregation-ready dashboard data from raw daily USD rows.
 * Converts USD → AUD, drops usage types averaging < MIN_AVG_COST_PER_DAY, and
 * rolls up categories. Category precedence: `categoryMap` (Supabase) →
 * `csvCategoryByKey` (CSV Category row) → built-in USAGE_TYPE_CATEGORY.
 */
export function buildAwsCostData(
  rawRows: RawDailyRow[],
  categoryMap?: Record<string, string>,
  csvCategoryByKey?: Record<string, string>
): AwsCostData {
  // Distinct usage types + per-day-per-type AUD amounts + per-type totals.
  const totals = new Map<string, number>();
  const daySet = new Set<string>();
  const dailyAll: Record<string, Record<string, number>> = {};

  for (const row of rawRows) {
    const day = row.day;
    daySet.add(day);
    const amount = (Number.isFinite(row.amountUsd) ? row.amountUsd : 0) * USD_TO_AUD;
    (dailyAll[day] ??= {})[row.usageType] =
      (dailyAll[day]?.[row.usageType] ?? 0) + amount;
    totals.set(row.usageType, (totals.get(row.usageType) ?? 0) + amount);
  }

  const days = Array.from(daySet).sort();
  if (days.length === 0) {
    return {
      days: [],
      usageTypes: [],
      categories: [],
      daily: {},
      grandTotal: 0,
      categorisedTotal: 0,
      droppedCount: 0,
    };
  }
  const dayCount = days.length || 1;

  const effectiveCategoryMap: Record<string, string> = {
    ...(csvCategoryByKey ?? {}),
    ...(categoryMap ?? {}),
  };

  // Keep only usage types averaging >= threshold per day; sort biggest first.
  const kept: UsageTypeSummary[] = [];
  let droppedCount = 0;
  for (const [key, total] of totals) {
    const avgPerDay = total / dayCount;
    if (avgPerDay >= MIN_AVG_COST_PER_DAY) {
      kept.push({
        key,
        label: cleanLabel(key),
        category: categoryFor(key, effectiveCategoryMap),
        total,
        avgPerDay,
      });
    } else if (total !== 0) {
      droppedCount++;
    }
  }
  kept.sort((a, b) => b.total - a.total);
  const keptKeys = kept.map((k) => k.key);

  // Roll up kept usage types into categories (skip uncategorised).
  const catMap = new Map<string, CategorySummary>();
  let categorisedTotal = 0;
  for (const u of kept) {
    if (!u.category) continue;
    categorisedTotal += u.total;
    let cat = catMap.get(u.category);
    if (!cat) {
      cat = { category: u.category, total: 0, avgPerDay: 0, usageTypeKeys: [] };
      catMap.set(u.category, cat);
    }
    cat.total += u.total;
    cat.usageTypeKeys.push(u.key);
  }
  const categories = Array.from(catMap.values())
    .map((c) => ({ ...c, avgPerDay: c.total / dayCount }))
    .sort((a, b) => b.total - a.total);

  // Rebuild the daily breakdown limited to kept usage types.
  const daily: Record<string, Record<string, number>> = {};
  let grandTotal = 0;
  for (const day of days) {
    const src = dailyAll[day] ?? {};
    const row: Record<string, number> = {};
    for (const key of keptKeys) {
      const amt = src[key] ?? 0;
      row[key] = amt;
      grandTotal += amt;
    }
    daily[day] = row;
  }

  return {
    days,
    usageTypes: kept,
    categories,
    daily,
    grandTotal,
    categorisedTotal,
    droppedCount,
  };
}

/**
 * Parse an AWS cost CSV directly into dashboard data (fallback path when the
 * Supabase store is empty/unavailable). Thin wrapper over parseAwsCostRows +
 * buildAwsCostData.
 *
 * @param categoryMap optional usage-type → category overrides (e.g. Supabase).
 */
export function parseAwsCosts(
  csvText: string,
  categoryMap?: Record<string, string>
): AwsCostData {
  const { rows, csvCategoryByKey } = parseAwsCostRows(csvText);
  return buildAwsCostData(rows, categoryMap, csvCategoryByKey);
}

// ---- Bucketing helpers -------------------------------------------------

// Fri→Thu week start, matching the rest of the app's weekly grouping. Returns
// the ISO date (UTC) of that week's Friday.
function fridayWeekStart(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const back = (d.getUTCDay() - 5 + 7) % 7; // Fri = 5
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function weekLabel(fridayIso: string): string {
  const fri = new Date(fridayIso + "T00:00:00Z");
  const thu = new Date(fri);
  thu.setUTCDate(fri.getUTCDate() + 6);
  return `${fmtDate(fridayIso)} – ${fmtDate(thu.toISOString().slice(0, 10))}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleDateString("en-AU", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Aggregate the daily data into buckets at the requested granularity. Each
 * bucket carries the total plus a per-usage-type breakdown (kept types only).
 */
export function bucketize(
  data: AwsCostData,
  granularity: Granularity
): CostBucket[] {
  const keptKeys = data.usageTypes.map((u) => u.key);
  const map = new Map<string, CostBucket>();

  const bucketKeyFor = (day: string): { key: string; label: string } => {
    if (granularity === "daily") return { key: day, label: fmtDate(day) };
    if (granularity === "weekly") {
      const wk = fridayWeekStart(day);
      return { key: wk, label: weekLabel(wk) };
    }
    const monthKey = day.slice(0, 7); // YYYY-MM
    return { key: monthKey, label: monthLabel(monthKey) };
  };

  for (const day of data.days) {
    const { key, label } = bucketKeyFor(day);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, label, total: 0, byUsageType: {} };
      for (const k of keptKeys) bucket.byUsageType[k] = 0;
      map.set(key, bucket);
    }
    const row = data.daily[day] ?? {};
    for (const k of keptKeys) {
      const amt = row[k] ?? 0;
      bucket.byUsageType[k] += amt;
      bucket.total += amt;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

// A time bucket with a per-CATEGORY breakdown (uncategorised usage types are
// excluded, matching the category rollups).
export type CategoryBucket = {
  key: string;
  label: string;
  total: number;
  byCategory: Record<string, number>;
};

/**
 * Aggregate the daily data into time buckets, summed by category. Only usage
 * types that have a category contribute; uncategorised ones are ignored.
 */
export function bucketizeByCategory(
  data: AwsCostData,
  granularity: Granularity
): CategoryBucket[] {
  const cats = data.categories.map((c) => c.category);
  // usage-type key -> category (kept + categorised only).
  const keyToCat = new Map<string, string>();
  for (const u of data.usageTypes) {
    if (u.category) keyToCat.set(u.key, u.category);
  }

  const map = new Map<string, CategoryBucket>();
  const bucketKeyFor = (day: string): { key: string; label: string } => {
    if (granularity === "daily") return { key: day, label: fmtDate(day) };
    if (granularity === "weekly") {
      const wk = fridayWeekStart(day);
      return { key: wk, label: weekLabel(wk) };
    }
    const monthKey = day.slice(0, 7);
    return { key: monthKey, label: monthLabel(monthKey) };
  };

  for (const day of data.days) {
    const { key, label } = bucketKeyFor(day);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, label, total: 0, byCategory: {} };
      for (const c of cats) bucket.byCategory[c] = 0;
      map.set(key, bucket);
    }
    const row = data.daily[day] ?? {};
    for (const [uKey, amt] of Object.entries(row)) {
      const cat = keyToCat.get(uKey);
      if (!cat) continue; // uncategorised → excluded
      bucket.byCategory[cat] += amt;
      bucket.total += amt;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

// Amounts are already in AUD (converted at parse time). Prefix with A$ to make
// the currency explicit.
export function formatMoney(v: number): string {
  return `A$${Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
