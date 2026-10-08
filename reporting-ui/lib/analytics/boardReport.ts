// Board-report summariser: turns the raw deputy_shifts (labour cost + hours)
// and TT_Games (games coded) rows into the handful of roll-ups a board report
// needs, for a chosen date range. Pure functions — no fetching — so they're
// trivially testable and reused by the page.
//
// Source of truth is the SAME Supabase data the Reporting dashboard reads
// (deputy_shifts, TT_Games), so the numbers reconcile with that page. Labour
// cost/hours come from deputy_shifts; games come from TT_Games. The two are
// filtered by their own date fields (shift_date / Date) over the chosen range.

import { calculateKPIs } from "@/lib/analytics";
import { isExcludedAnalystName } from "@/lib/analytics/excludedAnalysts";

// Rows arrive untyped from Supabase (`select("*")`); we read defensively.
export type ShiftRow = Record<string, unknown>;
export type GameRow = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => String(v ?? "").trim();

// The calendar-date part (yyyy-mm-dd) of a date-ish value, or "" if unparseable.
export function isoDate(value: unknown): string {
  const s = str(value);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

// Month bucket key ("yyyy-mm") for a date-ish value, or "" if unparseable.
function monthKey(value: unknown): string {
  const iso = isoDate(value);
  return iso ? iso.slice(0, 7) : "";
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// A single cost area (e.g. "Home Analyst") rolled up over the range.
export type AreaSummary = {
  area: string;
  cost: number;
  hours: number;
  shifts: number;
  /** Share of total labour cost (0–1). */
  costShare: number;
};

export type MonthSummary = {
  key: string; // yyyy-mm
  label: string; // "March 2026"
  cost: number;
  hours: number;
  games: number;
};

export type AnalystSummary = {
  name: string;
  cost: number;
  hours: number;
  games: number;
};

export type BoardReport = {
  from: string; // yyyy-mm-dd (inclusive)
  to: string; // yyyy-mm-dd (inclusive)
  // Headline KPIs.
  totalCost: number;
  totalHours: number;
  totalGames: number;
  headcount: number; // distinct analysts with a shift in range (excl. placeholders)
  shiftCount: number;
  avgCostPerHour: number;
  avgCostPerGame: number;
  avgHoursPerGame: number;
  // Breakdowns.
  byArea: AreaSummary[]; // biggest cost first
  byMonth: MonthSummary[]; // chronological
  homeVsOffice: { home: number; office: number; other: number }; // labour cost
  gamesByLocation: { aus: number; phl: number; other: number };
  topAnalystsByGames: AnalystSummary[]; // top 10
  topAnalystsByCost: AnalystSummary[]; // top 10
};

// Keep only rows whose date field falls within [from, to] (inclusive). `field`
// is the row's date property name (shift_date for shifts, Date for games).
function inRange(row: Record<string, unknown>, field: string, from: string, to: string): boolean {
  const d = isoDate(row[field]);
  return !!d && d >= from && d <= to;
}

/**
 * Build the full board report for a date range from the raw Supabase rows.
 * `from`/`to` are inclusive yyyy-mm-dd. Shifts drive cost/hours; games drive
 * the games count. Placeholder "PREMIER DATA" shifts/games are excluded from
 * per-analyst roll-ups (matching every other analyst-attributing view) but a
 * placeholder shift's COST still counts toward area/total cost — it's real
 * spend, just not attributable to one person.
 */
export function buildBoardReport(
  shiftRows: ShiftRow[],
  gameRows: GameRow[],
  from: string,
  to: string
): BoardReport {
  const shifts = shiftRows.filter((r) => inRange(r, "shift_date", from, to));
  const games = gameRows.filter((r) => inRange(r, "Date", from, to));

  // Headline cost/hours/headcount via the shared KPI helper (same math the
  // Reporting dashboard uses), mapped to the fields it expects.
  const kpiRows = shifts.map((r) => ({
    employee_name: str(r.employee_name),
    total_hours: num(r.total_hours),
    total_cost: num(r.total_cost),
  }));
  const kpis = calculateKPIs(kpiRows);

  // Headcount = distinct REAL analysts (exclude the "PREMIER DATA" placeholder).
  const realNames = new Set<string>();
  for (const r of shifts) {
    const name = str(r.employee_name);
    if (name && !isExcludedAnalystName(name)) realNames.add(name.toLowerCase());
  }

  // By area.
  const areaMap = new Map<string, AreaSummary>();
  for (const r of shifts) {
    const area = str(r.area_name) || "(unassigned)";
    const a =
      areaMap.get(area) ??
      { area, cost: 0, hours: 0, shifts: 0, costShare: 0 };
    a.cost += num(r.total_cost);
    a.hours += num(r.total_hours);
    a.shifts += 1;
    areaMap.set(area, a);
  }
  const byArea = Array.from(areaMap.values()).sort((x, y) => y.cost - x.cost);
  for (const a of byArea) {
    a.costShare = kpis.totalCost > 0 ? a.cost / kpis.totalCost : 0;
  }

  // Home vs Office analyst (by area name).
  let home = 0;
  let office = 0;
  let other = 0;
  for (const a of byArea) {
    const key = a.area.toLowerCase();
    if (key === "home analyst") home += a.cost;
    else if (key === "office analyst") office += a.cost;
    else other += a.cost;
  }

  // By month: cost/hours from shifts, games from TT_Games, merged on month key.
  const monthMap = new Map<string, MonthSummary>();
  const getMonth = (key: string): MonthSummary => {
    let m = monthMap.get(key);
    if (!m) {
      m = { key, label: monthLabel(key), cost: 0, hours: 0, games: 0 };
      monthMap.set(key, m);
    }
    return m;
  };
  for (const r of shifts) {
    const mk = monthKey(r.shift_date);
    if (!mk) continue;
    const m = getMonth(mk);
    m.cost += num(r.total_cost);
    m.hours += num(r.total_hours);
  }
  for (const r of games) {
    const mk = monthKey(r.Date);
    if (!mk) continue;
    getMonth(mk).games += 1;
  }
  const byMonth = Array.from(monthMap.values()).sort((x, y) =>
    x.key.localeCompare(y.key)
  );

  // Games by location (AUS / PHL / other).
  let aus = 0;
  let phl = 0;
  let gOther = 0;
  for (const r of games) {
    const loc = str(r.Location).toUpperCase();
    if (loc === "AUS") aus += 1;
    else if (loc === "PHL") phl += 1;
    else gOther += 1;
  }

  // Per-analyst roll-ups (exclude placeholders). Cost/hours from shifts; games
  // from TT_Games counting BOTH allocation sides (home_allocated/away_allocated)
  // so a game an analyst coded on either side is credited to them.
  const analystMap = new Map<string, AnalystSummary>();
  const getAnalyst = (name: string): AnalystSummary => {
    const key = name.toLowerCase();
    let a = analystMap.get(key);
    if (!a) {
      a = { name, cost: 0, hours: 0, games: 0 };
      analystMap.set(key, a);
    }
    return a;
  };
  for (const r of shifts) {
    const name = str(r.employee_name);
    if (!name || isExcludedAnalystName(name)) continue;
    const a = getAnalyst(name);
    a.cost += num(r.total_cost);
    a.hours += num(r.total_hours);
  }
  for (const r of games) {
    // A game lists an allocated analyst per side; credit each distinct real
    // analyst once per game.
    const sides = [str(r.home_allocated), str(r.away_allocated)];
    const credited = new Set<string>();
    for (const side of sides) {
      if (!side || isExcludedAnalystName(side)) continue;
      const key = side.toLowerCase();
      if (credited.has(key)) continue;
      credited.add(key);
      getAnalyst(side).games += 1;
    }
  }
  const analysts = Array.from(analystMap.values());
  const topAnalystsByGames = [...analysts]
    .sort((x, y) => y.games - x.games)
    .slice(0, 10);
  const topAnalystsByCost = [...analysts]
    .sort((x, y) => y.cost - x.cost)
    .slice(0, 10);

  const totalGames = games.length;
  return {
    from,
    to,
    totalCost: kpis.totalCost,
    totalHours: kpis.totalHours,
    totalGames,
    headcount: realNames.size,
    shiftCount: kpis.shiftCount,
    avgCostPerHour: kpis.totalHours > 0 ? kpis.totalCost / kpis.totalHours : 0,
    avgCostPerGame: totalGames > 0 ? kpis.totalCost / totalGames : 0,
    avgHoursPerGame: totalGames > 0 ? kpis.totalHours / totalGames : 0,
    byArea,
    byMonth,
    homeVsOffice: { home, office, other },
    gamesByLocation: { aus, phl, other: gOther },
    topAnalystsByGames,
    topAnalystsByCost,
  };
}
