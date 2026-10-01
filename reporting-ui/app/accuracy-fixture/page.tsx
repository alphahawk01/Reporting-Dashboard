"use client";

// Fixture Accuracy — start an accuracy comparison by picking a finalised
// fixture instead of uploading the master XML by hand.
//
// Flow: pick Sport → Year → Week → Game. The game's JADE fixture uid (parsed
// from the comp_fixtures id "compUid:fixtureUid") is the {FixtureID} in the S3
// report path. On "Compare", we navigate to the existing Accuracy Comparison
// page with ?fixtureId=<uid>&sport=<afl|football>, which fetches the master
// timeline straight from S3 (JSON) — the analyst then only drops in their own
// file. All the comparison UI lives on /accuracy-compare; this page is just
// the picker, so the two never diverge.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Loader2, AlertTriangle, ArrowRight } from "lucide-react";

import {
  getReviewFixturesFromComps,
  fixtureTitle,
  type ReviewFixture,
} from "@/lib/api/reviewFixtures";
import { getCompFacets } from "@/lib/api/compFixtures";

// ── Week helpers (Thursday → Wednesday, mirroring Fixture Review / Comp
// Fixtures). The filter value is the week's Thursday as yyyy-mm-dd. ───────────

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekThursday(d: Date): Date {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sinceThu = (day.getDay() - 4 + 7) % 7; // 0=Sun … 4=Thu … 6=Sat
  day.setDate(day.getDate() - sinceThu);
  return day;
}

function currentWeekThursday(now = new Date()): string {
  return toDateInput(weekThursday(now));
}

function weekLabel(fromISO: string): string {
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  const md = (dt: Date) =>
    dt.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${md(from)} – ${md(to)} ${to.getFullYear()}`;
}

// The calendar-date part (yyyy-mm-dd) of a fixture's date string, or "".
function dateKey(fixtureDate: string): string {
  const s = (fixtureDate ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return toDateInput(d);
}

// Map the comp_fixtures sport name to the accuracy-compare sport flag. The
// comparison page only distinguishes "afl" vs "football" (its player-stats
// table + stat vocabulary); Soccer → football, everything else → afl.
function sportFlag(sportName: string): "afl" | "football" {
  return sportName.trim().toLowerCase() === "soccer" ? "football" : "afl";
}

export default function AccuracyFixturePage() {
  const router = useRouter();

  // --- Filters (Sport, Year, Week) — same source as Fixture Review --------
  const [sport, setSport] = useState<string>("Australian Rules Football");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [week, setWeek] = useState<string>(currentWeekThursday());
  // The analyst game may be in a DIFFERENT week than the master, so it gets its
  // own week selector (sport/year stay shared — they're almost always the same
  // for both sides of a comparison).
  const [analystWeek, setAnalystWeek] = useState<string>(currentWeekThursday());
  // The MASTER fixture (the reference timeline) and the ANALYST fixture (the
  // one being graded). Both are pulled from S3 by their own fixture id; they
  // are usually the same match coded under two different fixture ids.
  const [selectedId, setSelectedId] = useState<string>("");
  const [analystId, setAnalystId] = useState<string>("");

  const [sportOptions, setSportOptions] = useState<
    { sport: string; count: number }[]
  >([]);
  const [yearOptions, setYearOptions] = useState<
    { year: string; count: number }[]
  >([]);

  // Master games come from the real comps; analyst games come ONLY from
  // "Accuracy" comps (e.g. "PD Soccer Accuracy Comp"), so they're loaded as a
  // separate list.
  const [fixtures, setFixtures] = useState<ReviewFixture[]>([]);
  const [fixturesError, setFixturesError] = useState<string | null>(null);
  const [loadingFixtures, setLoadingFixtures] = useState(true);
  const [analystFixtures, setAnalystFixtures] = useState<ReviewFixture[]>([]);
  const [analystFixturesError, setAnalystFixturesError] = useState<
    string | null
  >(null);
  const [loadingAnalystFixtures, setLoadingAnalystFixtures] = useState(true);

  // Load Sport/Year facet options once.
  useEffect(() => {
    let cancelled = false;
    getCompFacets()
      .then((f) => {
        if (cancelled) return;
        setSportOptions(f.sports);
        setYearOptions(f.years);
      })
      .catch((err) => console.error("Failed loading fixture facets:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Load games for the current Sport + Year slice. Week is applied client-side.
  useEffect(() => {
    let cancelled = false;
    setLoadingFixtures(true);
    getReviewFixturesFromComps({
      sport,
      season: year === "all" ? undefined : Number(year),
    })
      .then((list) => {
        if (cancelled) return;
        // Need a JADE fixture uid to fetch the S3 report; a video isn't
        // required for an accuracy comparison, so DON'T filter on hasVideo.
        setFixtures(list.filter((f) => f.jadeFixtureUid != null));
        setFixturesError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setFixturesError(
          err instanceof Error ? err.message : "Failed to load games"
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingFixtures(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sport, year]);

  // Load the ANALYST games — ONLY from "Accuracy" comps. Same sport/year slice.
  useEffect(() => {
    let cancelled = false;
    setLoadingAnalystFixtures(true);
    getReviewFixturesFromComps({
      sport,
      season: year === "all" ? undefined : Number(year),
      accuracyOnly: true,
    })
      .then((list) => {
        if (cancelled) return;
        setAnalystFixtures(list.filter((f) => f.jadeFixtureUid != null));
        setAnalystFixturesError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setAnalystFixturesError(
          err instanceof Error ? err.message : "Failed to load analyst games"
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingAnalystFixtures(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sport, year]);

  // Week dropdown options: one Thu→Wed week per option, most recent first,
  // with per-week game counts (continuous range between first and last game).
  const weekOptions = useMemo(() => {
    const counts = new Map<string, number>();
    let minMs = Infinity;
    let maxMs = -Infinity;
    for (const f of fixtures) {
      const k = dateKey(f.date);
      if (!k) continue;
      const d = new Date(`${k}T00:00:00`);
      const thuIso = toDateInput(weekThursday(d));
      counts.set(thuIso, (counts.get(thuIso) ?? 0) + 1);
      const ms = d.getTime();
      if (ms < minMs) minMs = ms;
      if (ms > maxMs) maxMs = ms;
    }
    const weeks = new Set<string>(counts.keys());
    if (Number.isFinite(minMs) && Number.isFinite(maxMs)) {
      const cur = weekThursday(new Date(minMs));
      const end = weekThursday(new Date(maxMs));
      while (cur.getTime() <= end.getTime()) {
        weeks.add(toDateInput(cur));
        cur.setDate(cur.getDate() + 7);
      }
    }
    return Array.from(weeks)
      .map((thu) => ({ thu, count: counts.get(thu) ?? 0 }))
      .sort((a, b) => (a.thu < b.thu ? 1 : a.thu > b.thu ? -1 : 0));
  }, [fixtures]);

  // Keep the selected week valid for the current data.
  useEffect(() => {
    if (weekOptions.length === 0) return;
    if (weekOptions.some((w) => w.thu === week)) return;
    const current = currentWeekThursday();
    const fallback = weekOptions.some((w) => w.thu === current)
      ? current
      : weekOptions[0].thu;
    setWeek(fallback);
  }, [weekOptions, week]);

  const weekRange = useMemo(() => {
    const from = new Date(`${week}T00:00:00`);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { from: toDateInput(from), to: toDateInput(to) };
  }, [week]);

  const gamesForWeek = useMemo(() => {
    return fixtures
      .filter((f) => {
        const k = dateKey(f.date);
        return k && k >= weekRange.from && k <= weekRange.to;
      })
      .sort((a, b) =>
        `${a.competition} ${a.homeTeam}`.localeCompare(
          `${b.competition} ${b.homeTeam}`
        )
      );
  }, [fixtures, weekRange]);

  // Analyst week options are derived from the ANALYST (accuracy) fixtures,
  // which are a different set of games than the master list.
  const analystWeekOptions = useMemo(() => {
    const counts = new Map<string, number>();
    let minMs = Infinity;
    let maxMs = -Infinity;
    for (const f of analystFixtures) {
      const k = dateKey(f.date);
      if (!k) continue;
      const d = new Date(`${k}T00:00:00`);
      const thuIso = toDateInput(weekThursday(d));
      counts.set(thuIso, (counts.get(thuIso) ?? 0) + 1);
      const ms = d.getTime();
      if (ms < minMs) minMs = ms;
      if (ms > maxMs) maxMs = ms;
    }
    const weeks = new Set<string>(counts.keys());
    if (Number.isFinite(minMs) && Number.isFinite(maxMs)) {
      const cur = weekThursday(new Date(minMs));
      const end = weekThursday(new Date(maxMs));
      while (cur.getTime() <= end.getTime()) {
        weeks.add(toDateInput(cur));
        cur.setDate(cur.getDate() + 7);
      }
    }
    return Array.from(weeks)
      .map((thu) => ({ thu, count: counts.get(thu) ?? 0 }))
      .sort((a, b) => (a.thu < b.thu ? 1 : a.thu > b.thu ? -1 : 0));
  }, [analystFixtures]);

  // Keep the analyst week valid for the analyst data.
  useEffect(() => {
    if (analystWeekOptions.length === 0) return;
    if (analystWeekOptions.some((w) => w.thu === analystWeek)) return;
    const current = currentWeekThursday();
    const fallback = analystWeekOptions.some((w) => w.thu === current)
      ? current
      : analystWeekOptions[0].thu;
    setAnalystWeek(fallback);
  }, [analystWeekOptions, analystWeek]);

  const analystWeekRange = useMemo(() => {
    const from = new Date(`${analystWeek}T00:00:00`);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { from: toDateInput(from), to: toDateInput(to) };
  }, [analystWeek]);

  const analystGamesForWeek = useMemo(() => {
    return analystFixtures
      .filter((f) => {
        const k = dateKey(f.date);
        return k && k >= analystWeekRange.from && k <= analystWeekRange.to;
      })
      .sort((a, b) =>
        `${a.competition} ${a.homeTeam}`.localeCompare(
          `${b.competition} ${b.homeTeam}`
        )
      );
  }, [analystFixtures, analystWeekRange]);

  // Clear a stale selection when its visible games change.
  useEffect(() => {
    if (selectedId && !gamesForWeek.some((f) => f.id === selectedId)) {
      setSelectedId("");
    }
  }, [gamesForWeek, selectedId]);
  useEffect(() => {
    if (analystId && !analystGamesForWeek.some((f) => f.id === analystId)) {
      setAnalystId("");
    }
  }, [analystGamesForWeek, analystId]);

  const selected = useMemo(
    () => gamesForWeek.find((f) => f.id === selectedId) ?? null,
    [gamesForWeek, selectedId]
  );
  const analystSelected = useMemo(
    () => analystGamesForWeek.find((f) => f.id === analystId) ?? null,
    [analystGamesForWeek, analystId]
  );

  function startComparison() {
    if (!selected?.jadeFixtureUid) return;
    const params = new URLSearchParams({
      fixtureId: String(selected.jadeFixtureUid),
      sport: sportFlag(selected.sport),
    });
    // Optional analyst timeline, also pulled from S3 by its fixture id.
    if (analystSelected?.jadeFixtureUid) {
      params.set("analystFixtureId", String(analystSelected.jadeFixtureUid));
    }
    router.push(`/accuracy-compare?${params.toString()}`);
  }

  const selectClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-red-500";

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
          <FileCheck2 size={26} /> Fixture Accuracy
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Pick the master fixture (the reference) and, optionally, the analyst
          game being graded. Analyst games come from the Accuracy competitions
          (e.g. &ldquo;PD Soccer Accuracy Comp&rdquo;). Both timelines are pulled
          straight from their match reports — no XML upload needed. You can still
          add or swap the analyst file on the comparison screen.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Sport
            </label>
            <select
              value={sport}
              onChange={(e) => {
                setSport(e.target.value);
                setSelectedId("");
                setAnalystId("");
              }}
              className={selectClass}
            >
              <option value="all">All sports</option>
              {sportOptions.map((s) => (
                <option key={s.sport} value={s.sport}>
                  {s.sport} ({s.count})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Year
            </label>
            <select
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setSelectedId("");
                setAnalystId("");
              }}
              className={selectClass}
            >
              <option value="all">All years</option>
              {yearOptions.map((y) => (
                <option key={y.year} value={y.year}>
                  {y.year} ({y.count})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Master week
            </label>
            <select
              value={week}
              onChange={(e) => {
                setWeek(e.target.value);
                setSelectedId("");
              }}
              className={selectClass}
              disabled={weekOptions.length === 0}
            >
              {weekOptions.length === 0 && <option value={week}>—</option>}
              {weekOptions.map((w) => (
                <option key={w.thu} value={w.thu}>
                  {weekLabel(w.thu)} ({w.count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* MASTER game — from the real comps, using the shared Week above. */}
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Master game (reference)
          </label>
          {loadingFixtures ? (
            <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
              <Loader2 size={15} className="animate-spin" /> Loading games…
            </div>
          ) : fixturesError ? (
            <div className="flex items-center gap-2 py-2 text-sm text-red-600">
              <AlertTriangle size={15} /> {fixturesError}
            </div>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className={selectClass}
              disabled={gamesForWeek.length === 0}
            >
              <option value="">
                {gamesForWeek.length === 0
                  ? "No games this week"
                  : `Select a game (${gamesForWeek.length})`}
              </option>
              {gamesForWeek.map((f) => (
                <option key={f.id} value={f.id}>
                  {fixtureTitle(f)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* ANALYST game — ONLY from "Accuracy" comps, with its own Week filter
            so it can be in a different week than the master. */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Analyst week
            </label>
            <select
              value={analystWeek}
              onChange={(e) => {
                setAnalystWeek(e.target.value);
                setAnalystId("");
              }}
              className={selectClass}
              disabled={analystWeekOptions.length === 0}
            >
              {analystWeekOptions.length === 0 && (
                <option value={analystWeek}>—</option>
              )}
              {analystWeekOptions.map((w) => (
                <option key={w.thu} value={w.thu}>
                  {weekLabel(w.thu)} ({w.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Analyst game (being graded) — optional
            </label>
            {loadingAnalystFixtures ? (
              <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
                <Loader2 size={15} className="animate-spin" /> Loading analyst
                games…
              </div>
            ) : analystFixturesError ? (
              <div className="flex items-center gap-2 py-2 text-sm text-red-600">
                <AlertTriangle size={15} /> {analystFixturesError}
              </div>
            ) : (
              <select
                value={analystId}
                onChange={(e) => setAnalystId(e.target.value)}
                className={selectClass}
                disabled={analystGamesForWeek.length === 0}
              >
                <option value="">
                  {analystFixtures.length === 0
                    ? "No accuracy games found"
                    : analystGamesForWeek.length === 0
                      ? "No games this week"
                      : "Select a game, or add it on the next screen"}
                </option>
                {analystGamesForWeek.map((f) => (
                  <option key={f.id} value={f.id}>
                    {fixtureTitle(f)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            {selected
              ? `Master #${selected.jadeFixtureUid}` +
                (analystSelected
                  ? ` · Analyst #${analystSelected.jadeFixtureUid}`
                  : " · analyst can be added on the comparison screen")
              : "Timelines are pulled from the match reports (created once a match is finalised)."}
          </p>
          <button
            onClick={startComparison}
            disabled={!selected?.jadeFixtureUid}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
          >
            Compare <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
