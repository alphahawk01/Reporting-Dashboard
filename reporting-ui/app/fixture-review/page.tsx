"use client";

// Fixture Review — pick a game by date, watch its match video, and step
// through the JADE-style stat timeline in sync with playback.
//
// Layout: a top filter bar (date dropdown → game dropdown), then the video
// player and the timeline table side by side.
//
// Data sources:
//  - Game list + video URL: the AutoDownload API (/api/fixtures), via
//    getReviewFixtures(). Every fixture carries a direct mp4 URL.
//  - Stat timeline: the S3 report JSON (Reports{jadeFixtureUid}.json), via
//    getFixtureTimeline(). These reports only exist AFTER a match is finalised.
//    The JADE fixture uid is resolved from the competition file by matching the
//    fixture's video URL; a manual-id fallback covers anything unmatched.
//
// Video sync mirrors the accuracy-compare page: a native <video> element, a
// seek that sets currentTime, and an onTimeUpdate handler that highlights the
// current event row as the video plays. relativeTime on each event is
// whole-game seconds; an adjustable offset aligns the video clock to match
// time when the recording doesn't start exactly at the first bounce.

import { useEffect, useMemo, useRef, useState } from "react";
import { ListVideo, Loader2, AlertTriangle, Film, CalendarDays } from "lucide-react";

import { THEME } from "@/lib/theme";
import SoccerPitch from "./SoccerPitch";
import {
  getReviewFixturesFromComps,
  fixtureTitle,
  type ReviewFixture,
} from "@/lib/api/reviewFixtures";
import { getCompFacets } from "@/lib/api/compFixtures";
import {
  getFixtureTimeline,
  statColumnsForSport,
  totalQuarterForSport,
  type StatColumn,
} from "@/lib/api/fixtureReports";
import { resolveJadeUidByVideo } from "@/lib/api/jadeCompMap";
import { compIdForName } from "@/lib/api/jadeComps";
import { getAllocatedVideoUrlsForAnalyst } from "@/lib/api/compFixtures";
import { useAuth } from "@/components/auth/AuthContext";
import type {
  FixtureTimeline,
  FixtureStatEvent,
  StatQuarter,
} from "@/types/fixtureReport";

// Format whole seconds as a clock, matching the HTML5 video player: H:MM:SS
// once past an hour (e.g. 4993 → "1:23:13"), otherwise M:SS (e.g. 137 → "2:17").
function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = sec.toString().padStart(2, "0");
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${ss}`;
  }
  return `${m}:${ss}`;
}

// The calendar-date part (yyyy-mm-dd) of a fixture's date string, or "" if
// unparseable. The API returns an ISO-ish string, so slicing the first 10
// chars is enough and avoids timezone shifts.
function dateKey(fixtureDate: string): string {
  const s = (fixtureDate ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Week helpers (mirror the Comp Fixtures "week" filter) ────────────────
// Weeks run Thursday → Wednesday. The filter value is the week's Thursday as a
// yyyy-mm-dd string; games are matched by their date falling in [Thu, Wed].

// Format a Date as yyyy-mm-dd (local date parts).
function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// The Thursday that begins the week containing `d`.
function weekThursday(d: Date): Date {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sinceThu = (day.getDay() - 4 + 7) % 7; // 0=Sun … 4=Thu … 6=Sat
  day.setDate(day.getDate() - sinceThu);
  return day;
}

// The Thursday of the current week, as a yyyy-mm-dd string.
function currentWeekThursday(now = new Date()): string {
  return toDateInput(weekThursday(now));
}

// A friendly "Fri 25 Sep 2026" label for a single yyyy-mm-dd date (used in the
// selected fixture's header to show its actual match date).
function matchDateLabel(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// A short "24 Sep – 30 Sep 2026" label for a week starting on `fromISO` (Thu).
function weekLabel(fromISO: string): string {
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  const md = (dt: Date) =>
    dt.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${md(from)} – ${md(to)} ${to.getFullYear()}`;
}

export default function FixtureReviewPage() {
  const { user } = useAuth();
  const isAnalystRole = user?.role === "analyst";
  const myName = user?.analyst_name?.trim() ?? "";

  // --- Game list ----------------------------------------------------------
  const [fixtures, setFixtures] = useState<ReviewFixture[]>([]);
  const [fixturesError, setFixturesError] = useState<string | null>(null);
  const [loadingFixtures, setLoadingFixtures] = useState(true);

  // "My allocated fixtures" filter: the set of video URLs (lowercased) the
  // logged-in analyst is allocated to (either side), and whether the filter is
  // on. Analyst-role users default to on (they mainly want their own games).
  const [myVideoUrls, setMyVideoUrls] = useState<Set<string>>(new Set());
  const [mineOnly, setMineOnly] = useState(false);

  // --- Filters (same as Comp Fixtures: Sport, Year, Week) ----------------
  // Sport ("all" or exact sportName). Default Aussie Rules.
  const [sport, setSport] = useState<string>("Australian Rules Football");
  // Season/year ("all" or a year as string). Default current year.
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  // Week filter: the selected week's Thursday (yyyy-mm-dd). Weeks run Thu→Wed.
  const [week, setWeek] = useState<string>(currentWeekThursday());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Sport/Year dropdown options (facets from comp_fixtures).
  const [sportOptions, setSportOptions] = useState<
    { sport: string; count: number }[]
  >([]);
  const [yearOptions, setYearOptions] = useState<
    { year: string; count: number }[]
  >([]);

  // --- Timeline filters --------------------------------------------------
  const [tlQuarter, setTlQuarter] = useState<number | "all">("all");
  const [tlEvent, setTlEvent] = useState<string>("all"); // statTypeName
  const [tlPlayer, setTlPlayer] = useState<number | "all">("all"); // playerUid

  // --- In-page tab + Player Stats filters --------------------------------
  const [tab, setTab] = useState<"review" | "stats">("review");
  // Which quarter/period to show: the sport's TOTAL by default (AFL=5,
  // Soccer=3). Set from the loaded fixture's sport.
  const [statQuarter, setStatQuarter] = useState<StatQuarter>(5);
  // Soccer splits columns into groups (Basic / Involvements); AFL uses one.
  // Which group's columns are shown.
  const [statGroup, setStatGroup] = useState<string>("");
  // Team filter for the stats table: "all" | home team uid | away team uid.
  const [statTeam, setStatTeam] = useState<"all" | number>("all");
  const [statSearch, setStatSearch] = useState("");
  // Sort column key (from STAT_COLUMNS) + direction. Default: Disposals desc.
  const [statSort, setStatSort] = useState<{ key: string; dir: "asc" | "desc" }>(
    { key: "d", dir: "desc" }
  );

  // --- Timeline -----------------------------------------------------------
  const [timeline, setTimeline] = useState<FixtureTimeline | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [manualUid, setManualUid] = useState("");

  // --- Video sync ---------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoTime, setVideoTime] = useState(0);
  const [offset, setOffset] = useState(0);
  // Per-row element refs, keyed by event uid, so the active row can be scrolled
  // into view as the video plays.
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  // Load Sport/Year facet options once (from comp_fixtures), like Comp Fixtures.
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

  // Load the games for the current Sport + Year slice from comp_fixtures. The
  // Week filter is applied client-side (below) so switching weeks doesn't
  // re-query. Re-runs when sport or year changes.
  useEffect(() => {
    let cancelled = false;
    setLoadingFixtures(true);
    getReviewFixturesFromComps({
      sport,
      season: year === "all" ? undefined : Number(year),
    })
      .then((list) => {
        if (cancelled) return;
        setFixtures(list.filter((f) => f.hasVideo));
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

  // Load the logged-in analyst's allocated fixtures (by video URL). Analyst-
  // role users default the "mine only" filter on so they land on their games.
  useEffect(() => {
    if (!myName) return;
    let cancelled = false;
    getAllocatedVideoUrlsForAnalyst(myName)
      .then((urls) => {
        if (cancelled) return;
        setMyVideoUrls(urls);
        if (isAnalystRole && urls.size > 0) setMineOnly(true);
      })
      .catch((err) =>
        console.error("Failed loading my allocated fixtures:", err)
      );
    return () => {
      cancelled = true;
    };
  }, [myName, isAnalystRole]);

  // Fixtures after the optional "mine only" allocation filter. Week options and
  // the games list are built from this so the filter applies consistently.
  const scopedFixtures = useMemo(() => {
    if (!mineOnly) return fixtures;
    return fixtures.filter((f) =>
      myVideoUrls.has((f.videoUrl ?? "").trim().toLowerCase())
    );
  }, [fixtures, mineOnly, myVideoUrls]);

  // Week dropdown options: one Thu→Wed week per option, most recent first. The
  // span between the earliest and latest game week is filled continuously (so
  // it's a proper weekly range, not just weeks that happen to have games), each
  // with a per-week game count — mirroring the Comp Fixtures week dropdown.
  const weekOptions = useMemo(() => {
    const counts = new Map<string, number>();
    let minMs = Infinity;
    let maxMs = -Infinity;
    for (const f of scopedFixtures) {
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
  }, [scopedFixtures]);

  // Keep the selected week valid for the current sport/year data. If the chosen
  // week has no games (e.g. after switching year), snap to the current week if
  // present, else the most recent week with games — so the view isn't stuck on
  // an empty range. Mirrors the Comp Fixtures behaviour.
  useEffect(() => {
    if (weekOptions.length === 0) return;
    if (weekOptions.some((w) => w.thu === week)) return;
    const current = currentWeekThursday();
    const fallback = weekOptions.some((w) => w.thu === current)
      ? current
      : weekOptions[0].thu; // most recent (list is desc)
    setWeek(fallback);
  }, [weekOptions, week]);

  // The selected week's inclusive [from, to] date-key range (Thu → Wed).
  const weekRange = useMemo(() => {
    const from = new Date(`${week}T00:00:00`);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { from: toDateInput(from), to: toDateInput(to) };
  }, [week]);

  // Games whose date falls in the selected week, sorted by competition + teams.
  const gamesForWeek = useMemo(() => {
    return scopedFixtures
      .filter((f) => {
        const k = dateKey(f.date);
        return k && k >= weekRange.from && k <= weekRange.to;
      })
      .sort((a, b) =>
        `${a.competition} ${a.homeTeam}`.localeCompare(
          `${b.competition} ${b.homeTeam}`
        )
      );
  }, [scopedFixtures, weekRange]);

  const selected = useMemo(
    () => fixtures.find((f) => f.id === selectedId) ?? null,
    [fixtures, selectedId]
  );

  // Load the timeline for a fixture, resolving the JADE uid via the comp file
  // (by video URL) when the fixture doesn't already carry one.
  async function loadTimelineFor(fixture: ReviewFixture, uidOverride?: number) {
    let uid = uidOverride ?? fixture.jadeFixtureUid;

    if (uid == null) {
      setLoadingTimeline(true);
      setTimelineError(null);
      const compId = compIdForName(fixture.competition);
      if (compId != null && fixture.videoUrl) {
        const resolved = await resolveJadeUidByVideo(fixture.videoUrl, compId);
        if (resolved != null) uid = resolved;
      }
    }

    if (uid == null) {
      setLoadingTimeline(false);
      setTimeline(null);
      setTimelineError(
        "Couldn't auto-match this fixture to a JADE report. Enter the report id below to load the timeline."
      );
      return;
    }

    setLoadingTimeline(true);
    setTimelineError(null);
    try {
      const result = await getFixtureTimeline(uid, {
        cache: "no-store",
        sport: fixture.sport,
      });
      setTimeline(result);
      if (result.eventCount === 0) {
        setTimelineError(
          `Report ${uid} loaded but has no timeline events (match may not be finalised).`
        );
      }
    } catch (err) {
      setTimeline(null);
      const message = err instanceof Error ? err.message : "Unknown error";
      setTimelineError(
        /HTTP 404/.test(message)
          ? `No report found for id ${uid}. The match report is only created after the match is finalised.`
          : `Failed to load report ${uid}: ${message}`
      );
    } finally {
      setLoadingTimeline(false);
    }
  }

  function selectFixture(f: ReviewFixture | null) {
    setSelectedId(f?.id ?? null);
    setTimeline(null);
    setTimelineError(null);
    setManualUid(f?.jadeFixtureUid != null ? String(f.jadeFixtureUid) : "");
    setVideoTime(0);
    setOffset(0);
    // Reset timeline filters for the new game.
    setTlQuarter("all");
    setTlEvent("all");
    setTlPlayer("all");
    if (f) void loadTimelineFor(f);
  }

  // First two distinct team uids = the two sides, for row colour-coding.
  const { homeTeamUid, awayTeamUid } = useMemo(() => {
    if (!timeline) return { homeTeamUid: null, awayTeamUid: null };
    const seen: number[] = [];
    for (const e of timeline.events) {
      if (e.teamUid && !seen.includes(e.teamUid)) {
        seen.push(e.teamUid);
        if (seen.length === 2) break;
      }
    }
    return { homeTeamUid: seen[0] ?? null, awayTeamUid: seen[1] ?? null };
  }, [timeline]);

  // Distinct event types (statTypeName) and players (playerName) present in the
  // timeline, for the filter dropdowns. Sorted alphabetically.
  const eventOptions = useMemo(() => {
    if (!timeline) return [] as string[];
    const set = new Set<string>();
    for (const e of timeline.events) if (e.statTypeName) set.add(e.statTypeName);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [timeline]);

  // Player filter options, keyed by playerUid, labelled "Team - #N Name".
  // Grouped/sorted by team then jumper number so the dropdown reads cleanly.
  const playerOptions = useMemo(() => {
    if (!timeline) return [] as { uid: number; label: string }[];
    const byUid = new Map<
      number,
      { uid: number; team: string; number: number | null; name: string }
    >();
    for (const e of timeline.events) {
      if (!e.playerName || !e.playerUid) continue;
      if (!byUid.has(e.playerUid)) {
        byUid.set(e.playerUid, {
          uid: e.playerUid,
          team: e.teamName ?? "",
          number: e.playerNumber ?? null,
          name: e.playerName,
        });
      }
    }
    return Array.from(byUid.values())
      .sort(
        (a, b) =>
          a.team.localeCompare(b.team) ||
          (a.number ?? 0) - (b.number ?? 0) ||
          a.name.localeCompare(b.name)
      )
      .map((p) => ({
        uid: p.uid,
        label: `${p.team} - ${p.number != null ? `#${p.number} ` : ""}${p.name}`,
      }));
  }, [timeline]);

  // Events after applying the timeline filters (quarter / event / player).
  const filteredEvents = useMemo(() => {
    if (!timeline) return [];
    return timeline.events.filter((e) => {
      if (tlQuarter !== "all" && e.quarter !== tlQuarter) return false;
      if (tlEvent !== "all" && e.statTypeName !== tlEvent) return false;
      if (tlPlayer !== "all" && e.playerUid !== tlPlayer) return false;
      return true;
    });
  }, [timeline, tlQuarter, tlEvent, tlPlayer]);

  // The event "active" at the current video position: last event whose aligned
  // time is at or before playback. Uses the FULL event list (not the filtered
  // view) so the highlight tracks playback even when a filter is applied.
  const activeEventUid = useMemo(() => {
    if (!timeline) return null;
    let active: number | null = null;
    for (const e of timeline.events) {
      if (e.relativeTime + offset <= videoTime) active = e.uid;
      else break;
    }
    return active;
  }, [timeline, videoTime, offset]);

  // The active event object (for the pitch map under the video). Shows just
  // the one stat happening now, in sync with playback.
  const activeEvent = useMemo(
    () =>
      timeline?.events.find((e) => e.uid === activeEventUid) ?? null,
    [timeline, activeEventUid]
  );

  // Auto-scroll the timeline so the active event sits at the TOP of the
  // scroll area (just under the sticky header), so the current stat and the
  // upcoming ones are what's visible. `block: "start"` scrolls the row to the
  // top of its nearest scroll container (the timeline's own overflow box).
  useEffect(() => {
    if (activeEventUid == null) return;
    const row = rowRefs.current.get(activeEventUid);
    row?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [activeEventUid]);

  function seekToEvent(e: FixtureStatEvent) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, e.relativeTime + offset);
    v.play().catch(() => {});
  }

  function rowTint(teamUid: number, isActive: boolean): string {
    if (isActive) return "bg-sky-500/50";
    if (teamUid === homeTeamUid) return "bg-emerald-500/35"; // home = green
    if (teamUid === awayTeamUid) return "bg-orange-500/35"; // away = orange
    return "";
  }

  // Sport-aware Player Stats config, derived from the loaded fixture's sport.
  const statColumns = useMemo<StatColumn[]>(
    () => statColumnsForSport(timeline?.sport),
    [timeline?.sport]
  );
  const totalQ = useMemo(
    () => totalQuarterForSport(timeline?.sport) as StatQuarter,
    [timeline?.sport]
  );
  const isSoccerStats = (timeline?.sport ?? "").trim().toLowerCase() === "soccer";

  // Distinct column groups in order (soccer: basic, involvements; AFL: afl).
  const statGroups = useMemo(() => {
    const seen: string[] = [];
    for (const c of statColumns) if (!seen.includes(c.group)) seen.push(c.group);
    return seen;
  }, [statColumns]);

  // Columns visible for the active group (AFL has a single group → all shown).
  const visibleStatColumns = useMemo(() => {
    const g = statGroup || statGroups[0] || "";
    return statColumns.filter((c) => c.group === g);
  }, [statColumns, statGroup, statGroups]);

  // The quarter/period toggle options for the sport: TOTAL plus the periods.
  // AFL: Q1–Q4 (total 5). Soccer: H1, H2 (total 3).
  const quarterOptions = useMemo<{ q: StatQuarter; label: string }[]>(() => {
    if (isSoccerStats) {
      return [
        { q: 3 as StatQuarter, label: "TOTAL" },
        { q: 1 as StatQuarter, label: "H1" },
        { q: 2 as StatQuarter, label: "H2" },
      ];
    }
    return [
      { q: 5 as StatQuarter, label: "TOTAL" },
      { q: 1 as StatQuarter, label: "Q1" },
      { q: 2 as StatQuarter, label: "Q2" },
      { q: 3 as StatQuarter, label: "Q3" },
      { q: 4 as StatQuarter, label: "Q4" },
    ];
  }, [isSoccerStats]);

  // When a new timeline loads, reset the stat view to the sport's defaults:
  // TOTAL quarter, first group, and a sensible default sort column.
  useEffect(() => {
    if (!timeline) return;
    setStatQuarter(totalQ);
    const firstGroup = statGroups[0] ?? "";
    setStatGroup(firstGroup);
    // Default sort: the primary column of the first group (disposals for AFL,
    // goals for soccer), descending.
    const firstCol = statColumns.find((c) => c.group === firstGroup);
    setStatSort({ key: firstCol?.key ?? "d", dir: "desc" });
  }, [timeline, totalQ, statGroups, statColumns]);

  // Player Stats rows: filtered by team + search, sorted by the active column
  // for the selected quarter. `players` comes from JADE's allPlayerStats.
  const statRows = useMemo(() => {
    if (!timeline) return [];
    const q = statSearch.trim().toLowerCase();
    const rows = timeline.players.filter((p) => {
      if (statTeam !== "all" && p.teamUid !== statTeam) return false;
      if (q) {
        const hay = `${p.playerNumber} ${p.playerName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const val = (p: (typeof rows)[number]) =>
      p.columns[statSort.key]?.[statQuarter] ?? 0;
    return [...rows].sort((a, b) => {
      const diff = val(a) - val(b);
      return statSort.dir === "asc" ? diff : -diff;
    });
  }, [timeline, statTeam, statSearch, statSort, statQuarter]);

  // Toggle sort on a stat column (desc first, then asc).
  function toggleStatSort(key: string) {
    setStatSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    );
  }

  return (
    <div
      className="min-h-screen p-4 text-slate-200"
      style={{ background: THEME.bg }}
    >
      <div className="w-full">
        {/* HEADER — compact so the video/pitch/timeline sit higher. */}
        <div className="mb-2 flex items-center gap-2">
          <ListVideo size={20} className="text-sky-400" />
          <h1 className="text-xl font-bold text-white">Fixture Review</h1>
        </div>

        {/* FILTER BAR: date dropdown + game dropdown */}
        <div
          className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border p-3"
          style={{ background: THEME.panel, borderColor: THEME.border }}
        >
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Sport
            </label>
            <select
              value={sport}
              onChange={(e) => {
                setSport(e.target.value);
                selectFixture(null);
              }}
              className="min-w-[170px] rounded-lg border border-slate-600 bg-[#0b1220] px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
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
                selectFixture(null);
              }}
              className="min-w-[120px] rounded-lg border border-slate-600 bg-[#0b1220] px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
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
              <CalendarDays size={13} className="mr-1 inline" />
              Week
            </label>
            <select
              value={week}
              onChange={(e) => {
                setWeek(e.target.value);
                selectFixture(null);
              }}
              className="min-w-[220px] rounded-lg border border-slate-600 bg-[#0b1220] px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              {weekOptions.length === 0 && <option value="">No weeks</option>}
              {weekOptions.map((w) => (
                <option key={w.thu} value={w.thu}>
                  {weekLabel(w.thu)} ({w.count})
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[280px] flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Game
            </label>
            <select
              value={selectedId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                const f = fixtures.find((x) => x.id === id) ?? null;
                selectFixture(f);
              }}
              className="w-full rounded-lg border border-slate-600 bg-[#0b1220] px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            >
              <option value="">
                {gamesForWeek.length > 0
                  ? `Select a game (${gamesForWeek.length})…`
                  : "No games this week"}
              </option>
              {gamesForWeek.map((f) => (
                <option key={f.id} value={f.id}>
                  {fixtureTitle(f)}
                </option>
              ))}
            </select>
          </div>

          {/* "My allocated fixtures" toggle — shows only fixtures the logged-in
              analyst is allocated to (either team side). Hidden if the user has
              no analyst name (e.g. not an allocated analyst). */}
          {myName && (
            <label
              className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-300"
              title="Show only fixtures allocated to you (home or away)"
            >
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(e) => {
                  setMineOnly(e.target.checked);
                  selectFixture(null);
                }}
                className="h-4 w-4 accent-sky-500"
              />
              My fixtures
              <span className="text-xs text-slate-500">
                ({myVideoUrls.size})
              </span>
            </label>
          )}

          {loadingFixtures && (
            <div className="flex items-center gap-2 pb-2 text-sm text-slate-400">
              <Loader2 size={15} className="animate-spin" /> Loading games…
            </div>
          )}
        </div>

        {fixturesError && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>{fixturesError}</span>
          </div>
        )}

        {!selected && !loadingFixtures && (
          <div
            className="flex h-48 items-center justify-center rounded-xl border text-slate-500"
            style={{ background: THEME.panel, borderColor: THEME.border }}
          >
            Select a week and game to begin.
          </div>
        )}

        {selected && (
          <>
            {/* Compact fixture header — one line, no separate card, so the
                video/pitch/timeline come up the page. */}
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <h2 className="font-semibold text-white">
                {selected.homeTeam}
                <span className="mx-1.5 text-slate-500">vs</span>
                {selected.awayTeam}
              </h2>
              <span className="text-slate-400">
                {[
                  selected.competition,
                  selected.round ? `R${selected.round}` : "",
                ]
                  .filter(Boolean)
                  .join(" ") || "—"}
              </span>
              <span className="text-slate-500">
                {matchDateLabel(dateKey(selected.date))}
              </span>
              {timeline && (
                <span className="text-slate-500">
                  {timeline.eventCount.toLocaleString()} events
                </span>
              )}
            </div>

            {/* IN-PAGE TABS */}
            <div className="mb-3 flex gap-1 border-b border-slate-700">
              {[
                { id: "review" as const, label: "Timeline & Video" },
                { id: "stats" as const, label: "Player Stats" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                    tab === t.id
                      ? "border-sky-400 text-white"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB: TIMELINE & VIDEO — side by side. Video gets the majority of
                the width (it benefits from size); the timeline is content-width
                so there's minimal dead space. */}
            {tab === "review" && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
              {/* Video */}
              <div className="min-w-0">
                {selected.hasVideo ? (
                  <div
                    className="overflow-hidden rounded-xl border"
                    style={{ borderColor: THEME.border }}
                  >
                    <video
                      ref={videoRef}
                      src={selected.videoUrl}
                      controls
                      // Hide the download control in the native player's menu,
                      // and block the right-click "Save video as…" fallback.
                      controlsList="nodownload"
                      onContextMenu={(e) => e.preventDefault()}
                      className="w-full bg-black"
                      style={{ maxHeight: "78vh" }}
                      onTimeUpdate={(e) =>
                        setVideoTime(e.currentTarget.currentTime)
                      }
                    />
                    <div className="flex items-center gap-3 bg-[#111f35] px-3 py-2 text-xs text-slate-400">
                      <Film size={14} />
                      <span className="font-mono">{formatClock(videoTime)}</span>
                      <label className="ml-auto flex items-center gap-2">
                        Sync offset (s)
                        <input
                          type="number"
                          value={offset}
                          onChange={(e) =>
                            setOffset(Number(e.target.value) || 0)
                          }
                          className="w-16 rounded border border-slate-600 bg-[#0b1220] px-2 py-1 text-slate-200 outline-none focus:border-sky-500"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-700 bg-[#0f1b2d] p-4 text-sm text-slate-400">
                    No video URL for this fixture.
                  </div>
                )}
              </div>

              {/* Timeline column — pitch map on top (aligned with the video
                  player's top), then the event timeline below. */}
              <div className="min-w-0">
                {/* Pitch map — shows ONLY the stat active at the current video
                    position, so you see where on the pitch it was clicked as
                    the video plays. */}
                {timeline && timeline.eventCount > 0 && (
                  <div className="mb-4">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold uppercase tracking-wide">
                        Pitch location
                      </span>
                      {activeEvent ? (
                        <span className="truncate">
                          {activeEvent.statTypeName}
                          {activeEvent.playerName
                            ? ` — ${
                                activeEvent.playerNumber != null
                                  ? `#${activeEvent.playerNumber} `
                                  : ""
                              }${activeEvent.playerName}`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          Play the video to track events
                        </span>
                      )}
                    </div>
                    <SoccerPitch
                      events={activeEvent ? [activeEvent] : []}
                      homeTeamUid={homeTeamUid}
                      awayTeamUid={awayTeamUid}
                      homeTeamName={selected?.homeTeam}
                      awayTeamName={selected?.awayTeam}
                      emphasize
                    />
                  </div>
                )}

                {loadingTimeline && (
                  <div className="flex items-center gap-2 p-3 text-sm text-slate-400">
                    <Loader2 size={15} className="animate-spin" /> Loading
                    timeline…
                  </div>
                )}

                {timelineError && (
                  <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      <span>{timelineError}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={manualUid}
                        onChange={(e) => setManualUid(e.target.value)}
                        placeholder="JADE report id"
                        className="w-40 rounded-lg border border-slate-600 bg-[#0b1220] px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
                      />
                      <button
                        onClick={() => {
                          const uid = Number(manualUid.trim());
                          if (Number.isInteger(uid) && uid > 0 && selected) {
                            void loadTimelineFor(selected, uid);
                          }
                        }}
                        className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
                      >
                        Load timeline
                      </button>
                    </div>
                  </div>
                )}

                {timeline && timeline.eventCount > 0 && (
                  <>
                    {/* Timeline filters: quarter / event / player */}
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <select
                        value={tlQuarter === "all" ? "all" : String(tlQuarter)}
                        onChange={(e) =>
                          setTlQuarter(
                            e.target.value === "all"
                              ? "all"
                              : Number(e.target.value)
                          )
                        }
                        className="rounded-lg border border-slate-600 bg-[#0b1220] px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
                      >
                        <option value="all">All quarters</option>
                        {[1, 2, 3, 4].map((q) => (
                          <option key={q} value={q}>
                            Q{q}
                          </option>
                        ))}
                      </select>

                      <select
                        value={tlEvent}
                        onChange={(e) => setTlEvent(e.target.value)}
                        className="max-w-[180px] rounded-lg border border-slate-600 bg-[#0b1220] px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
                      >
                        <option value="all">All events</option>
                        {eventOptions.map((ev) => (
                          <option key={ev} value={ev}>
                            {ev}
                          </option>
                        ))}
                      </select>

                      <select
                        value={tlPlayer === "all" ? "all" : String(tlPlayer)}
                        onChange={(e) =>
                          setTlPlayer(
                            e.target.value === "all"
                              ? "all"
                              : Number(e.target.value)
                          )
                        }
                        className="max-w-[240px] rounded-lg border border-slate-600 bg-[#0b1220] px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
                      >
                        <option value="all">All players</option>
                        {playerOptions.map((pl) => (
                          <option key={pl.uid} value={pl.uid}>
                            {pl.label}
                          </option>
                        ))}
                      </select>

                      <span className="text-xs text-slate-500">
                        {filteredEvents.length.toLocaleString()} /{" "}
                        {timeline.eventCount.toLocaleString()}
                      </span>
                      {(tlQuarter !== "all" ||
                        tlEvent !== "all" ||
                        tlPlayer !== "all") && (
                        <button
                          onClick={() => {
                            setTlQuarter("all");
                            setTlEvent("all");
                            setTlPlayer("all");
                          }}
                          className="text-xs font-medium text-sky-400 hover:text-sky-300"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div
                      className="overflow-hidden rounded-xl border"
                      style={{ borderColor: THEME.border }}
                    >
                    {/* ~10 rows visible at a time: sticky header (~34px) +
                        10 rows (~30px each). The rest scroll. */}
                    <div className="max-h-[334px] overflow-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead className="sticky top-0">
                          <tr className="bg-[#111f35] text-left text-xs uppercase tracking-wide text-slate-400">
                            <th className="px-3 py-2 font-medium">Qtr</th>
                            <th className="px-3 py-2 font-medium">Time</th>
                            <th className="px-3 py-2 font-medium">Event</th>
                            <th className="px-3 py-2 font-medium">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredEvents.map((e) => {
                            const isActive = e.uid === activeEventUid;
                            return (
                              <tr
                                key={e.uid}
                                ref={(el) => {
                                  if (el) rowRefs.current.set(e.uid, el);
                                  else rowRefs.current.delete(e.uid);
                                }}
                                onClick={() => seekToEvent(e)}
                                // Offset the scroll target by the sticky header
                                // height so the active row isn't hidden under it
                                // when it scrolls to the top.
                                style={{ scrollMarginTop: 34 }}
                                className={`cursor-pointer border-t border-slate-800/60 transition hover:brightness-125 ${rowTint(
                                  e.teamUid,
                                  isActive
                                )}`}
                                title="Jump video to this moment"
                              >
                                <td className="px-3 py-1.5 text-slate-400">
                                  {e.quarter}
                                </td>
                                <td className="px-3 py-1.5 font-mono text-slate-300">
                                  {formatClock(e.relativeTime)}
                                </td>
                                <td className="px-3 py-1.5 text-slate-100">
                                  {e.statTypeName}
                                </td>
                                <td className="px-3 py-1.5 text-slate-300">
                                  {e.playerName ? (
                                    <>
                                      {e.playerNumber != null && (
                                        <span className="mr-1.5 font-semibold text-slate-400">
                                          #{e.playerNumber}
                                        </span>
                                      )}
                                      {e.playerName}
                                    </>
                                  ) : (
                                    e.teamName || ""
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    </div>
                    {filteredEvents.length === 0 && (
                      <p className="p-4 text-center text-sm text-slate-500">
                        No events match the filters.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
            )}

            {/* TAB: PLAYER STATS */}
            {tab === "stats" && (
              <div>
                {loadingTimeline && (
                  <div className="flex items-center gap-2 p-3 text-sm text-slate-400">
                    <Loader2 size={15} className="animate-spin" /> Loading
                    stats…
                  </div>
                )}
                {timelineError && !timeline && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
                    {timelineError}
                  </div>
                )}
                {timeline && timeline.players.length > 0 && (
                  <>
                    {/* Controls: quarter toggle, team filter, search */}
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <div className="flex overflow-hidden rounded-lg border border-slate-600">
                        {quarterOptions.map((opt) => (
                          <button
                            key={opt.q}
                            onClick={() => setStatQuarter(opt.q)}
                            className={`px-3 py-1.5 text-xs font-semibold transition ${
                              statQuarter === opt.q
                                ? "bg-sky-600 text-white"
                                : "bg-[#0b1220] text-slate-300 hover:bg-[#111f35]"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {/* Group toggle (soccer: Basic / Involvements). Hidden
                          when there's only one group (AFL). */}
                      {statGroups.length > 1 && (
                        <div className="flex overflow-hidden rounded-lg border border-slate-600">
                          {statGroups.map((g) => (
                            <button
                              key={g}
                              onClick={() => setStatGroup(g)}
                              className={`px-3 py-1.5 text-xs font-semibold capitalize transition ${
                                (statGroup || statGroups[0]) === g
                                  ? "bg-sky-600 text-white"
                                  : "bg-[#0b1220] text-slate-300 hover:bg-[#111f35]"
                              }`}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex overflow-hidden rounded-lg border border-slate-600">
                        {[
                          { id: "all" as const, label: "All Players" },
                          ...(homeTeamUid != null
                            ? [{ id: homeTeamUid, label: selected.homeTeam }]
                            : []),
                          ...(awayTeamUid != null
                            ? [{ id: awayTeamUid, label: selected.awayTeam }]
                            : []),
                        ].map((t) => (
                          <button
                            key={String(t.id)}
                            onClick={() => setStatTeam(t.id)}
                            className={`px-3 py-1.5 text-xs font-semibold transition ${
                              statTeam === t.id
                                ? "bg-sky-600 text-white"
                                : "bg-[#0b1220] text-slate-300 hover:bg-[#111f35]"
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      <input
                        type="text"
                        value={statSearch}
                        onChange={(e) => setStatSearch(e.target.value)}
                        placeholder="Search player…"
                        className="rounded-lg border border-slate-600 bg-[#0b1220] px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
                      />
                    </div>

                    {/* Stats table */}
                    <div
                      className="overflow-hidden rounded-xl border"
                      style={{ borderColor: THEME.border }}
                    >
                      <div className="max-h-[65vh] overflow-auto">
                        <table className="w-full border-collapse text-sm">
                          <thead className="sticky top-0">
                            <tr className="bg-[#111f35] text-xs uppercase tracking-wide text-slate-400">
                              <th className="px-3 py-2 text-left font-medium">
                                Player
                              </th>
                              {visibleStatColumns.map((c) => (
                                <th
                                  key={c.key}
                                  onClick={() => toggleStatSort(c.key)}
                                  title={`${c.title} — click to sort`}
                                  className={`cursor-pointer px-3 py-2 text-right font-medium hover:text-white ${
                                    statSort.key === c.key ? "text-sky-400" : ""
                                  }`}
                                >
                                  {c.label}
                                  {statSort.key === c.key
                                    ? statSort.dir === "desc"
                                      ? " ↓"
                                      : " ↑"
                                    : ""}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {statRows.map((p) => (
                              <tr
                                key={p.playerUid}
                                className={`border-t border-slate-800/60 ${
                                  p.teamUid === homeTeamUid
                                    ? "bg-emerald-500/25"
                                    : p.teamUid === awayTeamUid
                                      ? "bg-orange-500/25"
                                      : ""
                                }`}
                              >
                                <td className="whitespace-nowrap px-3 py-1.5 text-slate-100">
                                  <span className="mr-1.5 font-semibold text-slate-400">
                                    {p.playerNumber}
                                  </span>
                                  {p.playerName}
                                </td>
                                {visibleStatColumns.map((c) => (
                                  <td
                                    key={c.key}
                                    className={`px-3 py-1.5 text-right tabular-nums ${
                                      statSort.key === c.key
                                        ? "font-semibold text-white"
                                        : "text-slate-300"
                                    }`}
                                  >
                                    {p.columns[c.key]?.[statQuarter] ?? 0}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {statRows.length === 0 && (
                      <p className="p-4 text-center text-sm text-slate-500">
                        No players match.
                      </p>
                    )}
                  </>
                )}
                {timeline && timeline.players.length === 0 && (
                  <div className="rounded-xl border border-slate-700 bg-[#0f1b2d] p-4 text-sm text-slate-400">
                    No player stats in this report.
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
