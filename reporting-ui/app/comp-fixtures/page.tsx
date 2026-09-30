"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Video,
  RefreshCw,
  Search,
  SlidersHorizontal,
  DatabaseZap,
  Plus,
  X,
} from "lucide-react";

import { THEME } from "@/lib/theme";
import {
  queryCompFixtures,
  getCompFacets,
  getCompSyncMeta,
  getCompFixtureCount,
  fullSync,
  incrementalSync,
  getAssignmentsForFixtures,
  assignCompFixture,
  unassignCompFixture,
  type CompFixtureRow,
  type CompSyncMeta,
  type SyncProgress,
  type CompAssignment,
} from "@/lib/api/compFixtures";
import {
  checkFileSizeRemote,
  getFixtures,
  syncGamesToApi,
} from "@/lib/api/fixtures";
import { assignFixture } from "@/lib/api/assignFixture";
import {
  createDownloadJob,
  retryFailedDownloadJobs,
} from "@/lib/api/downloadJobs";
import {
  getAutoDownloadAnalysts,
  type AutoDownloadAnalyst,
} from "@/lib/api/analysts";
import { normaliseKeyPart } from "@/lib/api/comps";
import { getHubConnection } from "@/lib/signalr";
import { HubConnectionState } from "@microsoft/signalr";

// Live download status for one fixture, matched from the .NET AutoDownload API
// by the composite key. Read-only overlay — no writes to the API in this step.
type ApiStatus = {
  /** The API's numeric fixture id — needed to assign / queue downloads. */
  id: number;
  status: string;
  downloadPercent: number | null;
  downloadSpeedMbps: number | null;
  fileSizeBytes: number | null;
  downloadCompletedAt: string | null;
  analyst: string | null;
  computer: string | null;
  location: string | null;
  /** All assignments on the API fixture (name/computer/location). */
  assignments: {
    id: number;
    analystId: number;
    name: string;
    location: string;
    computerName?: string | null;
  }[];
};

// Composite match key (home|away|competition|round), normalised identically to
// the Fixtures tab so a comp fixture lines up with its API fixture.
function apiKeyFor(parts: {
  home: string;
  away: string;
  competition: string;
  round: string;
}): string {
  return [
    normaliseKeyPart(parts.home),
    normaliseKeyPart(parts.away),
    normaliseKeyPart(parts.competition),
    normaliseKeyPart(parts.round),
  ].join("|");
}

// Re-sync automatically (incremental) when the stored data is older than this.
const STALE_MS = 60 * 60 * 1000; // 1 hour

// File-size lookup state: in flight, a resolved byte count, or "unknown"
// (checked but the size service returned nothing / was unreachable).
type SizeState = "checking" | "unknown" | number;

// Format a size cell. "Checking…" only while a lookup is genuinely in flight;
// once a check completes with no size (service down / no HEAD), show a dash so
// it doesn't look stuck. undefined = not requested yet.
function formatSize(state: SizeState | undefined): string {
  if (state === "checking") return "Checking…";
  if (state === "unknown" || state === undefined) return "—";
  if (state <= 0) return "—";
  const gb = state / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(state / 1024 / 1024).toFixed(0)} MB`;
}

// Fixtures sourced live from the S3 competition JSONs (c_421..c_859), kept
// entirely separate from the existing /fixtures page (download API + Supabase).

// Friendlier label for a raw sportName from the JSON (e.g. "Soccer" ->
// "Soccer / Football"). Unknown sports fall through unchanged.
function sportLabel(sportName: string): string {
  const s = sportName.trim().toLowerCase();
  if (s === "soccer" || s === "football") return "Soccer / Football";
  if (s === "australian rules football") return "Aussie Rules";
  return sportName;
}

// The exact sportName the JSON uses for Aussie Rules — the default sport.
const AUSSIE_RULES = "Australian Rules Football";

// Status pill styling, mirroring the Fixtures tab's StatusBadge.
function statusClasses(status: string): string {
  switch (status) {
    case "Downloaded":
      return "bg-emerald-100 text-emerald-700";
    case "Downloading":
      return "bg-sky-100 text-sky-700";
    case "Queued":
      return "bg-yellow-100 text-yellow-700";
    case "Failed":
      return "bg-red-100 text-red-700";
    case "Assigned":
      return "bg-purple-100 text-purple-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

// Merged Status+Progress label + styling for one fixture's live overlay.
// Lifecycle: Pending → Allocated → NN% (while downloading) → Downloaded
// (Failed on error). `st` is the API overlay for the fixture (null = no match).
function mergedStatus(st: {
  status: string;
  downloadPercent?: number | null;
  downloadSpeedMbps?: number | null;
} | null): { label: string; classes: string } {
  if (!st) return { label: "Pending", classes: statusClasses("") };
  switch (st.status) {
    case "Assigned":
    case "Queued":
      return { label: "Allocated", classes: statusClasses("Assigned") };
    case "Downloading": {
      // While downloading, the badge shows the percent and (if known) the
      // live speed: "45% · 16 MB/s". Falls back to "Downloading" until the
      // first progress tick arrives.
      const pct =
        st.downloadPercent != null
          ? `${st.downloadPercent.toFixed(0)}%`
          : "Downloading";
      const speed =
        st.downloadSpeedMbps && st.downloadSpeedMbps > 0
          ? ` · ${st.downloadSpeedMbps.toFixed(1)} MB/s`
          : "";
      return { label: `${pct}${speed}`, classes: statusClasses("Downloading") };
    }
    case "Downloaded":
      return { label: "Downloaded", classes: statusClasses("Downloaded") };
    case "Failed":
      return { label: "Failed", classes: statusClasses("Failed") };
    default:
      return { label: st.status || "Pending", classes: statusClasses(st.status) };
  }
}

// Format a Date as a yyyy-mm-dd string (local date parts), matching the value
// a <input type="date"> expects.
function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// The Thursday that begins the week containing `d` (weeks run Thu -> Wed).
function weekThursday(d: Date): Date {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sinceThu = (day.getDay() - 4 + 7) % 7; // 0=Sun … 4=Thu … 6=Sat
  day.setDate(day.getDate() - sinceThu);
  return day;
}

// The current week running Thursday -> Wednesday, as the two yyyy-mm-dd strings
// the filter uses.
function currentThursdayToWednesday(now = new Date()): {
  from: string;
  to: string;
} {
  const thursday = weekThursday(now);
  const wednesday = new Date(thursday);
  wednesday.setDate(thursday.getDate() + 6);
  return { from: toDateInput(thursday), to: toDateInput(wednesday) };
}

// A short "24 Sep – 30 Sep 2026" style label for a week starting on `fromISO`.
function weekLabel(fromISO: string): string {
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  const md = (dt: Date) =>
    dt.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${md(from)} – ${md(to)} ${to.getFullYear()}`;
}

export default function CompFixturesPage() {
  // Rows for the CURRENT sport+year query (the two filters applied server-side
  // in Supabase). Date/search/exclude/competition filtering happens on top of
  // this set client-side.
  const [rows, setRows] = useState<CompFixtureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync state / progress (populating Supabase from S3).
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [meta, setMeta] = useState<CompSyncMeta | null>(null);

  // Video file sizes, checked on demand via the download API's Cloudflare HEAD
  // (same source the Fixtures tab uses). Keyed by video URL and cached so
  // re-renders / re-filters don't re-check the same file.
  const [sizes, setSizes] = useState<Map<string, SizeState>>(new Map());

  // Analyst allocations, keyed by comp_fixture_id, loaded with the rows.
  const [assignments, setAssignments] = useState<
    Map<string, CompAssignment[]>
  >(new Map());
  // Analysts for allocation — from the AutoDownload API (carry Home/Office
  // computers, required to queue a download job).
  const [analysts, setAnalysts] = useState<AutoDownloadAnalyst[]>([]);
  // Retry-failed button busy state.
  const [retrying, setRetrying] = useState(false);
  // Which fixture + side has its "Add Analyst" dropdown open, if any. Tracking
  // the side lets the Home and Away add-slots open independently.
  const [addingFixture, setAddingFixture] = useState<
    { id: string; side: "home" | "away" } | null
  >(null);
  // Fixture id currently being written (disables its control while saving).
  const [savingAssign, setSavingAssign] = useState<string | null>(null);

  // Live download status from the .NET AutoDownload API, keyed by the composite
  // key (home|away|comp|round). READ-ONLY overlay for now — matched onto comp
  // fixtures to show Status/Progress/Speed/Downloaded At without writing.
  const [apiStatus, setApiStatus] = useState<Map<string, ApiStatus>>(new Map());
  // Whether the API was reachable on the last fetch (affects what we show).
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  // Fetch the .NET API fixtures and index them by the composite key so each
  // comp fixture can show its live download status (and be allocated). Callable
  // on demand (after sync/allocate) as well as on the 5s poll / SignalR.
  const pullApiStatus = useCallback(async () => {
    try {
      const apiFixtures = await getFixtures();
      const map = new Map<string, ApiStatus>();
      for (const fx of apiFixtures) {
        const key = apiKeyFor({
          home: fx.home_team,
          away: fx.away_team,
          competition: fx.Competition,
          round: fx.Round,
        });
        const assignment = fx.assignments?.[0] ?? null;
        // On a key collision prefer the row that has actually progressed
        // (non-Pending or assigned), so a blank duplicate can't clobber it.
        const existing = map.get(key);
        const better =
          !existing ||
          (fx.status && fx.status !== "Pending" && existing.status === "Pending") ||
          (!!assignment && !existing.analyst);
        if (better) {
          map.set(key, {
            id: fx.id,
            status: fx.status ?? "Pending",
            downloadPercent: fx.downloadPercent ?? null,
            downloadSpeedMbps: fx.downloadSpeedMbps ?? null,
            fileSizeBytes: fx.fileSizeBytes ?? null,
            downloadCompletedAt: fx.downloadCompletedAt ?? null,
            analyst: assignment?.name ?? null,
            computer: assignment?.computerName ?? null,
            location: assignment?.location ?? null,
            assignments: Array.isArray(fx.assignments) ? fx.assignments : [],
          });
        }
      }
      setApiStatus(map);
      setApiReachable(true);
      return map;
    } catch {
      setApiReachable(false);
      return null;
    }
  }, []);

  // The distinct sports/years present in the table, for the dropdowns. Loaded
  // independently of the current query so all options always show.
  const [allSports, setAllSports] = useState<{ sport: string; count: number }[]>(
    []
  );
  const [allYears, setAllYears] = useState<{ year: string; count: number }[]>(
    []
  );

  // Default date range: the current Thursday -> Wednesday week.
  const defaultWeek = useMemo(() => currentThursdayToWednesday(), []);

  // Filters. Defaults: Aussie Rules, current year, this Thu->Wed week.
  const [competition, setCompetition] = useState<string>("all");
  const [search, setSearch] = useState("");
  // Season/year filter ("all" or a season number as string, e.g. "2025").
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  // Sport filter ("all" or the exact sportName, e.g. "Soccer").
  const [sport, setSport] = useState<string>(AUSSIE_RULES);
  // Week filter: the selected week's Thursday (yyyy-mm-dd), or "all" for every
  // week. Defaults to the current Thu->Wed week.
  const [week, setWeek] = useState<string>(defaultWeek.from);

  // The selected week resolved to an inclusive [from, to] date range (Thu->Wed),
  // or nulls when "all" is chosen. Drives the same date filter as before.
  const { dateFrom, dateTo } = useMemo(() => {
    if (week === "all") return { dateFrom: "", dateTo: "" };
    const from = new Date(`${week}T00:00:00`);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { dateFrom: week, dateTo: toDateInput(to) };
  }, [week]);
  // Competition names to HIDE from the results.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  // Whether the "exclude competitions" panel is open.
  const [excludeOpen, setExcludeOpen] = useState(false);

  // Sorting — mirrors the Fixtures tab (click a header to sort, toggle dir).
  const [sortField, setSortField] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  function sortBy(field: string) {
    if (sortField === field) {
      setSortDirection((cur) => (cur === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  // Sort indicator, same glyphs as the Fixtures tab. Returned as a plain
  // string (not a nested component) so it can sit inline in the header.
  const sortArrow = (field: string) =>
    sortField === field ? (sortDirection === "asc" ? " ↑" : " ↓") : "";

  const syncingRef = useRef(false);

  // Refresh the dropdown option lists + meta from Supabase.
  const refreshFacets = useCallback(async () => {
    const [facets, m] = await Promise.all([
      getCompFacets(),
      getCompSyncMeta(),
    ]);
    setAllSports(facets.sports);
    setAllYears(facets.years);
    setMeta(m);
  }, []);

  // Query the CURRENT sport+year slice from Supabase. Fast: server-side
  // filtered, only the matching rows come back.
  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await queryCompFixtures({
        sport,
        season: year === "all" ? undefined : Number(year),
      });
      setRows(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed loading fixtures."
      );
    } finally {
      setLoading(false);
    }
  }, [sport, year]);

  // Run an incremental sync (used on first load if empty/stale, and by the
  // button). A full sync is used only when the table is empty.
  const doSync = useCallback(
    async (mode: "incremental" | "full") => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      setSyncProgress(null);
      setError(null);
      try {
        if (mode === "full") {
          await fullSync({ onProgress: setSyncProgress });
        } else {
          await incrementalSync({ onProgress: setSyncProgress });
        }
        await refreshFacets();
        await runQuery();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sync failed.");
      } finally {
        syncingRef.current = false;
        setSyncing(false);
        setSyncProgress(null);
      }
    },
    [refreshFacets, runQuery]
  );

  // First load: read from Supabase immediately; if the table is empty, run a
  // full sync to populate it; if it's stale (>1h), kick a background
  // incremental sync so new/changed comps are picked up without blocking.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      await refreshFacets();
      const count = await getCompFixtureCount();
      if (cancelled) return;
      if (count === 0) {
        // Nothing stored yet — populate from S3 once.
        await doSync("full");
        return;
      }
      await runQuery();
      // Stale check: refresh in the background if the last sync is old.
      const m = await getCompSyncMeta();
      const last = m?.last_incremental ?? m?.last_full_sync ?? null;
      const stale = !last || Date.now() - new Date(last).getTime() > STALE_MS;
      if (stale && !cancelled) doSync("incremental");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-query whenever the server-side filters (sport/year) change.
  useEffect(() => {
    queueMicrotask(() => runQuery());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, year]);

  // Sport dropdown options (from the table's distinct sports).
  const sportOptions = allSports;

  // Year dropdown options. We keep the full year list (from the table); the
  // counts are table-wide, which is fine for a picker.
  const yearOptions = allYears;

  // Competition options come from the currently-loaded rows (already scoped to
  // the active sport+year server-side), so they stay relevant to the view.
  const competitionOptions = useMemo(() => {
    const set = new Map<string, number>();
    for (const f of rows) {
      if (!f.competition) continue;
      set.set(f.competition, (set.get(f.competition) ?? 0) + 1);
    }
    return Array.from(set.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [rows]);

  // Week dropdown options: one Thu->Wed week per option, in ASCENDING order
  // (earliest at the top). Built only from the dates present in the loaded rows
  // — which are already scoped to the selected sport+year — so the weeks shown
  // relate to the chosen year. The span is filled week-by-week so it's a
  // continuous range, not just weeks that happen to have fixtures. Each value
  // is the week's Thursday (yyyy-mm-dd); a per-week fixture count is shown.
  const weekOptions = useMemo(() => {
    const counts = new Map<string, number>();
    let minMs = Infinity;
    let maxMs = -Infinity;
    for (const f of rows) {
      if (!f.fixture_date) continue;
      const d = new Date(`${f.fixture_date}T00:00:00`);
      const thuIso = toDateInput(weekThursday(d));
      counts.set(thuIso, (counts.get(thuIso) ?? 0) + 1);
      const ms = d.getTime();
      if (ms < minMs) minMs = ms;
      if (ms > maxMs) maxMs = ms;
    }

    const weeks = new Set<string>(counts.keys());
    // Fill the gaps between the earliest and latest week so the dropdown is a
    // continuous weekly range across the (year-scoped) data.
    if (Number.isFinite(minMs) && Number.isFinite(maxMs)) {
      let cur = weekThursday(new Date(minMs));
      const end = weekThursday(new Date(maxMs));
      while (cur.getTime() <= end.getTime()) {
        weeks.add(toDateInput(cur));
        cur = new Date(cur);
        cur.setDate(cur.getDate() + 7);
      }
    }

    return Array.from(weeks)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) // earliest first (ascending)
      .map((thuIso) => ({
        value: thuIso,
        label: weekLabel(thuIso),
        count: counts.get(thuIso) ?? 0,
      }));
  }, [rows]);

  // Keep the selected week valid for the current (year-scoped) options. The
  // default is the current calendar week, which may not exist in the selected
  // year's data — when it doesn't, snap to the current week if present, else
  // the LATEST available week so the view isn't stuck on an empty range.
  useEffect(() => {
    if (week === "all" || weekOptions.length === 0) return;
    if (weekOptions.some((w) => w.value === week)) return;
    const current = defaultWeek.from;
    const fallback = weekOptions.some((w) => w.value === current)
      ? current
      : weekOptions[weekOptions.length - 1].value; // latest (ascending list)
    // Deferred so the effect body doesn't setState synchronously.
    queueMicrotask(() => setWeek(fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOptions]);

  // Apply the client-side filters over the server-scoped rows (sport + year
  // are already applied by the Supabase query): competition, exclusions, date
  // range and free-text search, then sort. fixture_date is an ISO "yyyy-mm-dd"
  // string, so lexicographic comparisons are correct for the date range/sort.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dateActive = !!dateFrom || !!dateTo;
    const filtered = rows.filter((f) => {
      if (competition !== "all" && f.competition !== competition) return false;
      if (excluded.has(f.competition)) return false;

      // Date range. Rows without a date are hidden when a range is set.
      if (dateActive) {
        if (!f.fixture_date) return false;
        if (dateFrom && f.fixture_date < dateFrom) return false;
        if (dateTo && f.fixture_date > dateTo) return false;
      }

      if (!q) return true;
      return (
        f.home_team.toLowerCase().includes(q) ||
        f.away_team.toLowerCase().includes(q) ||
        f.competition.toLowerCase().includes(q) ||
        f.round.toLowerCase().includes(q)
      );
    });

    // Sort key per column (same columns the Fixtures tab exposes).
    const keyOf = (f: CompFixtureRow): string => {
      switch (sortField) {
        case "date":
          return f.fixture_date ?? "";
        case "round":
          return f.round.toLowerCase();
        case "league":
          return f.competition.toLowerCase();
        case "match":
          return `${f.home_team} ${f.away_team}`.toLowerCase();
        default:
          return f.fixture_date ?? "";
      }
    };

    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      if (ka < kb) return -1 * dir;
      if (ka > kb) return 1 * dir;
      return 0;
    });
  }, [
    rows,
    competition,
    excluded,
    dateFrom,
    dateTo,
    search,
    sortField,
    sortDirection,
  ]);

  // Look up a comp fixture's live API status by its composite key.
  const statusFor = useCallback(
    (f: CompFixtureRow): ApiStatus | null => {
      const key = apiKeyFor({
        home: f.home_team,
        away: f.away_team,
        competition: f.competition,
        round: f.round,
      });
      return apiStatus.get(key) ?? null;
    },
    [apiStatus]
  );

  // How many of the visible fixtures matched an API record (the overlay's
  // coverage) — shown so we can gauge how well the composite keys align.
  const matchRate = useMemo(() => {
    if (visible.length === 0) return { matched: 0, total: 0 };
    let matched = 0;
    for (const f of visible) if (statusFor(f)) matched += 1;
    return { matched, total: visible.length };
  }, [visible, statusFor]);

  // Download summary over the visible fixtures (mirrors the Fixtures cards).
  const summary = useMemo(() => {
    let assigned = 0;
    let downloading = 0;
    let downloaded = 0;
    let failed = 0;
    for (const f of visible) {
      const st = statusFor(f);
      if (!st) continue;
      if (st.status === "Downloaded") downloaded += 1;
      else if (st.status === "Downloading") downloading += 1;
      else if (st.status === "Failed") failed += 1;
      if (st.analyst || st.status === "Assigned") assigned += 1;
    }
    return { assigned, downloading, downloaded, failed };
  }, [visible, statusFor]);

  // Toggle one competition in the exclusion set.
  function toggleExcluded(name: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Check video file sizes for the CURRENTLY VISIBLE rows that have a video
  // URL and haven't been checked yet. Runs against the download API's
  // Cloudflare HEAD endpoint (checkFileSize), the same source the Fixtures tab
  // uses. Bounded concurrency + a per-URL cache so we only hit each file once,
  // and only for what's on screen (not all thousands of fixtures).
  useEffect(() => {
    const urls = Array.from(
      new Set(
        visible
          .map((f) => f.video_url)
          .filter((u): u is string => !!u && !sizes.has(u))
      )
    );
    if (urls.length === 0) return;

    let cancelled = false;

    (async () => {
      // Mark them "checking" so the UI shows the pending state (deferred so the
      // effect body doesn't setState synchronously — avoids a cascading render).
      setSizes((prev) => {
        const next = new Map(prev);
        for (const u of urls) next.set(u, "checking");
        return next;
      });

      const CONCURRENCY = 5;
      let cursor = 0;
      async function worker() {
        while (cursor < urls.length) {
          if (cancelled) return;
          const url = urls[cursor++];
          const bytes = await checkFileSizeRemote(url);
          if (cancelled) return;
          setSizes((prev) => {
            const next = new Map(prev);
            // A number > 0 is a real size; anything else means the size
            // service had nothing (or was unreachable) — mark "unknown" so the
            // cell shows a dash instead of a perpetual "Checking…".
            next.set(url, typeof bytes === "number" && bytes > 0 ? bytes : "unknown");
            return next;
          });
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () =>
          worker()
        )
      );
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Load the AutoDownload analysts once (with Home/Office computers) for the
  // allocation dropdown.
  useEffect(() => {
    let cancelled = false;
    getAutoDownloadAnalysts()
      .then((list) => {
        if (!cancelled) setAnalysts(Array.isArray(list) ? list : []);
      })
      .catch((err) =>
        console.error("Failed loading AutoDownload analysts:", err)
      );
    return () => {
      cancelled = true;
    };
  }, []);

  // SignalR: refresh the status overlay instantly when the agent reports a
  // change (RefreshOperations), in addition to the 5s poll. Mirrors Fixtures —
  // removes only THIS handler on cleanup.
  useEffect(() => {
    const connection = getHubConnection();
    const handleRefresh = () => {
      pullApiStatus();
    };
    connection.off("RefreshOperations", handleRefresh);
    connection.on("RefreshOperations", handleRefresh);
    if (connection.state === HubConnectionState.Disconnected) {
      connection.start().catch((err) =>
        console.error("Comp Fixtures SignalR connect failed:", err)
      );
    }
    return () => {
      connection.off("RefreshOperations", handleRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NOTE: we deliberately do NOT proactively bulk-register unmatched fixtures
  // into the API. The API keys fixtures by its own GameKey while our overlay
  // matches on the composite (home|away|comp|round); a fixture can be
  // "unmatched" by the composite yet already present in the API under the same
  // GameKey, so a bulk sync-games would repeatedly hit the API's unique-key
  // constraint (and create rows with URLs its metadata service can't read).
  // Instead a fixture is registered ON DEMAND at allocate time, tolerant of the
  // "already exists" case (see allocate()).

  // Live status overlay refresh: on mount, every 5s, and via SignalR.
  useEffect(() => {
    queueMicrotask(() => pullApiStatus());
    const interval = setInterval(() => pullApiStatus(), 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load allocations for the currently-loaded rows whenever they change.
  const reloadAssignments = useCallback(async (ids: string[]) => {
    const map = await getAssignmentsForFixtures(ids);
    setAssignments(map);
  }, []);

  useEffect(() => {
    const ids = rows.map((r) => r.id);
    // Deferred so the effect body doesn't setState synchronously.
    queueMicrotask(() => {
      if (ids.length === 0) setAssignments(new Map());
      else reloadAssignments(ids);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Allocate an analyst to a fixture via the AutoDownload pipeline — the SAME
  // flow as the Fixtures tab:
  //   1. Ensure the fixture exists in the API (sync it if unmatched), so we
  //      have a numeric API fixture id to assign against.
  //   2. assignFixture(apiFixtureId, analystId, location) — records ownership.
  //   3. createDownloadJob({...}) — queues the desktop agent (keyed by
  //      gameKey + videoUrl), which is what actually starts the download.
  // Also records the allocation in Supabase (comp_fixture_assignments) so the
  // comp view has a local record even if the API is briefly unavailable.
  async function allocate(
    f: CompFixtureRow,
    analystId: number,
    location: "Home" | "Office",
    teamSide: "home" | "away"
  ) {
    const analyst = analysts.find((a) => a.id === analystId);
    if (!analyst) {
      alert("Analyst not found.");
      return;
    }
    const computer =
      location === "Home" ? analyst.homeComputer : analyst.officeComputer;
    if (!computer) {
      alert(`${analyst.name} has no ${location} computer assigned.`);
      return;
    }

    setSavingAssign(f.id);
    try {
      // Resolve the API fixture id for this comp fixture; if it isn't in the
      // API yet, register it and re-pull so we get its id.
      const key = apiKeyFor({
        home: f.home_team,
        away: f.away_team,
        competition: f.competition,
        round: f.round,
      });
      let apiId = apiStatus.get(key)?.id ?? null;
      if (apiId == null && f.video_url) {
        // Try to register just THIS fixture so the API has an id to assign
        // against. syncGamesToApi never throws (it returns 0 on failure), and
        // a failure here is often just "already exists under a different key" —
        // so we don't treat it as fatal. Either way we re-pull and try to
        // resolve the id by the composite key.
        await syncGamesToApi([
          {
            gameKey: f.game_key,
            date: f.fixture_date ?? "",
            year: (f.fixture_date ?? "").substring(0, 4),
            leagueName: f.competition,
            round: f.round,
            homeTeam: f.home_team,
            awayTeam: f.away_team,
            videoUrl: f.video_url,
          },
        ]);
        const refreshed = await pullApiStatus();
        apiId = refreshed?.get(key)?.id ?? null;
      }
      if (apiId == null) {
        throw new Error(
          "Couldn't match this fixture to the download system. Its competition/round/team names may differ from the download API — assign it from the Fixtures tab, or check the naming."
        );
      }

      await assignFixture(apiId, analystId, location);

      if (f.video_url) {
        await createDownloadJob({
          gameKey: f.game_key,
          videoUrl: f.video_url,
          year: (f.fixture_date ?? "").substring(0, 4),
          leagueName: f.competition,
          analystId,
          computerId: computer.id,
          assignmentLocation: location,
          fileSizeBytes: sizeBytesFor(f),
        });
      }

      // Local record for the comp view (name-based), tagged with the team side
      // the analyst is allocated to. Plus refresh both views.
      await assignCompFixture(f.id, analyst.name, teamSide).catch(() => {});
      await Promise.all([
        reloadAssignments(rows.map((r) => r.id)),
        pullApiStatus(),
      ]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed allocating analyst.");
    } finally {
      setSavingAssign(null);
      setAddingFixture(null);
    }
  }

  // Remove the local Supabase allocation record (does not unassign in the API).
  async function removeAllocation(fixtureId: string, assignmentId: number) {
    setSavingAssign(fixtureId);
    try {
      await unassignCompFixture(assignmentId);
      await reloadAssignments(rows.map((r) => r.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed removing allocation.");
    } finally {
      setSavingAssign(null);
    }
  }

  // Best-known size in bytes for a fixture: the API-reported size if matched,
  // else the Cloudflare HEAD result we cached, else null.
  function sizeBytesFor(f: CompFixtureRow): number | null {
    const key = apiKeyFor({
      home: f.home_team,
      away: f.away_team,
      competition: f.competition,
      round: f.round,
    });
    const apiSize = apiStatus.get(key)?.fileSizeBytes ?? null;
    if (apiSize != null && apiSize > 0) return apiSize;
    const s = f.video_url ? sizes.get(f.video_url) : undefined;
    return typeof s === "number" && s > 0 ? s : null;
  }

  // Retry all failed downloads (requeues them for the agent), then refresh.
  async function handleRetryFailed() {
    setRetrying(true);
    try {
      const result = await retryFailedDownloadJobs();
      await pullApiStatus();
      alert(
        result.requeued === 0
          ? "No failed downloads to retry."
          : `Requeued ${result.requeued} failed download${
              result.requeued === 1 ? "" : "s"
            }.`
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div
      className="min-h-screen p-6 text-slate-200"
      style={{ background: THEME.bg }}
    >
      <div className="w-full">
        {/* HEADER */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
              <CalendarDays size={22} className="text-sky-400" />
              Competition Fixtures
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Sourced from the competition exports in S3, cached in the database
              for fast filtering. Use “Sync from S3” to pull in new or updated
              competitions.
            </p>
            {meta && (
              <p className="mt-1 text-xs text-slate-500">
                {meta.fixture_count.toLocaleString()} fixtures ·{" "}
                {meta.comp_count} competitions
                {(() => {
                  const last = meta.last_incremental ?? meta.last_full_sync;
                  return last
                    ? ` · last synced ${new Date(last).toLocaleString("en-AU")}`
                    : "";
                })()}
              </p>
            )}
            {/* Download-status overlay coverage (read-only). Shows how many of
                the visible fixtures matched a record in the AutoDownload API —
                the alignment measure for the composite key. */}
            <p className="mt-1 text-xs">
              {apiReachable === false ? (
                <span className="text-amber-500">
                  AutoDownload API unreachable — no live status.
                </span>
              ) : matchRate.total > 0 ? (
                <span className="text-slate-500">
                  Live status matched{" "}
                  <span className="font-semibold text-sky-400">
                    {matchRate.matched}
                  </span>{" "}
                  / {matchRate.total} visible fixtures
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRetryFailed}
              disabled={retrying || summary.failed === 0}
              title="Requeue all failed downloads"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0f1b2d] px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-40"
            >
              <RefreshCw size={14} className={retrying ? "animate-spin" : ""} />
              Retry failed{summary.failed > 0 ? ` (${summary.failed})` : ""}
            </button>
            <button
              onClick={() => runQuery()}
              disabled={loading || syncing}
              title="Reload from the database"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0f1b2d] px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Reload
            </button>
            <button
              onClick={() => doSync("incremental")}
              disabled={syncing}
              title="Fetch new / changed competitions from S3 into the database"
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
            >
              <DatabaseZap
                size={14}
                className={syncing ? "animate-pulse" : ""}
              />
              {syncing ? "Syncing…" : "Sync from S3"}
            </button>
          </div>
        </div>

        {/* DOWNLOAD SUMMARY (from the API overlay, over the visible fixtures) */}
        {!loading && !error && matchRate.total > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Assigned", value: summary.assigned, tone: "text-purple-400" },
              { label: "Downloading", value: summary.downloading, tone: "text-sky-400" },
              { label: "Downloaded", value: summary.downloaded, tone: "text-emerald-400" },
              { label: "Failed", value: summary.failed, tone: "text-red-400" },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-2xl border border-slate-700 bg-[#0f1b2d] p-4"
              >
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {c.label}
                </div>
                <div className={`mt-1 text-2xl font-bold ${c.tone}`}>
                  {c.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SYNC PROGRESS */}
        {syncing && (
          <div className="mb-6 rounded-2xl border border-slate-700 bg-[#0f1b2d] p-5">
            <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
              <span>
                Syncing competitions from S3
                {syncProgress?.phase === "probing"
                  ? " (checking for new competitions)…"
                  : "…"}
              </span>
              <span className="tabular-nums text-slate-400">
                {syncProgress
                  ? `${syncProgress.done}/${syncProgress.total} · ${syncProgress.found} updated · ${syncProgress.fixtures} fixtures`
                  : "starting…"}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{
                  width: `${
                    syncProgress && syncProgress.total > 0
                      ? Math.round(
                          (syncProgress.done / syncProgress.total) * 100
                        )
                      : 5
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* LOADING (reading from the database) */}
        {loading && !syncing && (
          <div className="mb-6 flex items-center gap-2 rounded-2xl border border-slate-700 bg-[#0f1b2d] p-5 text-sm text-slate-400">
            <RefreshCw size={14} className="animate-spin" />
            Loading fixtures…
          </div>
        )}

        {/* ERROR */}
        {error && !loading && (
          <div className="mb-6 rounded-2xl border border-amber-700/50 bg-amber-950/40 p-5 text-sm text-amber-200">
            <p className="font-semibold">Couldn&apos;t load competition data</p>
            <p className="mt-1 text-amber-300/80">{error}</p>
          </div>
        )}

        {/* FILTERS */}
        {!loading && !error && (
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Sport
                </label>
                <select
                  value={sport}
                  onChange={(e) => {
                    setSport(e.target.value);
                    // Reset dependent filters so they aren't stuck on a value
                    // from another sport.
                    setYear("all");
                    setCompetition("all");
                  }}
                  className="min-w-[150px] rounded-lg border border-slate-700 bg-[#0f1b2d] px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
                >
                  <option value="all">All sports</option>
                  {sportOptions.map((s) => (
                    <option key={s.sport} value={s.sport}>
                      {sportLabel(s.sport)} ({s.count})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Year
                </label>
                <select
                  value={year}
                  onChange={(e) => {
                    setYear(e.target.value);
                    // Reset the competition filter so it isn't stuck on a comp
                    // from a different year.
                    setCompetition("all");
                  }}
                  className="min-w-[120px] rounded-lg border border-slate-700 bg-[#0f1b2d] px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
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
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Competition
                </label>
                <select
                  value={competition}
                  onChange={(e) => setCompetition(e.target.value)}
                  className="min-w-[220px] rounded-lg border border-slate-700 bg-[#0f1b2d] px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
                >
                  <option value="all">
                    All competitions ({competitionOptions.length})
                  </option>
                  {competitionOptions.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Week (Thursday -> Wednesday range) */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Week
                </label>
                <select
                  value={week}
                  onChange={(e) => setWeek(e.target.value)}
                  className="min-w-[190px] rounded-lg border border-slate-700 bg-[#0f1b2d] px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500"
                >
                  <option value="all">All weeks</option>
                  {weekOptions.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label} ({w.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Exclude competitions toggle */}
              <button
                onClick={() => setExcludeOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  excluded.size > 0
                    ? "border-sky-600 bg-sky-950/40 text-sky-300"
                    : "border-slate-700 bg-[#0f1b2d] text-slate-300 hover:bg-slate-800"
                }`}
              >
                <SlidersHorizontal size={14} />
                Exclude comps
                {excluded.size > 0 && (
                  <span className="rounded-full bg-sky-600 px-1.5 text-xs font-semibold text-white">
                    {excluded.size}
                  </span>
                )}
              </button>

              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Search
                </label>
                <div className="relative">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Team, competition or round…"
                    className="w-full rounded-lg border border-slate-700 bg-[#0f1b2d] py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>

            {/* Exclude-competitions checklist panel */}
            {excludeOpen && (
              <div className="rounded-2xl border border-slate-700 bg-[#0f1b2d] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-200">
                    Hide these competitions
                  </span>
                  {excluded.size > 0 && (
                    <button
                      onClick={() => setExcluded(new Set())}
                      className="text-xs font-medium text-sky-400 hover:text-sky-300"
                    >
                      Clear ({excluded.size})
                    </button>
                  )}
                </div>
                <div className="grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                  {competitionOptions.map((c) => (
                    <label
                      key={c.name}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={excluded.has(c.name)}
                        onChange={() => toggleExcluded(c.name)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-sky-500"
                      />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {c.count}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* FIXTURES TABLE — same layout as the Fixtures tab. Columns that come
            from the download pipeline (Status/Size/Downloaded At/Assignments)
            don't exist for comp fixtures, so they render "-". Status merges the
            old Status + Progress + Speed: Pending → Allocated → "NN% · MB/s" →
            Downloaded. */}
        {!loading && !error && (
          <div className="overflow-hidden rounded-xl bg-white text-slate-700 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                {/* Column widths (in order): Date, Round, League, Match,
                    Status, Size, Downloaded At, Assignments.
                    No whitespace/comments BETWEEN <col> tags — text nodes
                    inside <colgroup> cause a hydration mismatch. */}
                <colgroup>
                  <col className="w-[8%]" />
                  <col className="w-[4%]" />
                  <col className="w-[17%]" />
                  <col className="w-[25%]" />
                  <col className="w-[14%]" />
                  <col className="w-[8%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                </colgroup>

                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th
                      onClick={() => sortBy("date")}
                      className="cursor-pointer whitespace-nowrap px-3 py-3 hover:bg-slate-700"
                    >
                      Date
                      {sortArrow("date")}
                    </th>
                    <th
                      onClick={() => sortBy("round")}
                      className="cursor-pointer whitespace-nowrap px-3 py-3 hover:bg-slate-700"
                    >
                      Round
                      {sortArrow("round")}
                    </th>
                    <th
                      onClick={() => sortBy("league")}
                      className="cursor-pointer whitespace-nowrap px-3 py-3 hover:bg-slate-700"
                    >
                      League
                      {sortArrow("league")}
                    </th>
                    <th
                      onClick={() => sortBy("match")}
                      className="cursor-pointer whitespace-nowrap px-3 py-3 hover:bg-slate-700"
                    >
                      Match
                      {sortArrow("match")}
                    </th>
                    <th className="whitespace-nowrap px-3 py-3">Status</th>
                    <th className="whitespace-nowrap px-3 py-3">Size</th>
                    <th className="whitespace-nowrap px-3 py-3">Downloaded At</th>
                    <th className="whitespace-nowrap px-3 py-3">Assignments</th>
                  </tr>
                </thead>

                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-3 py-10 text-center text-slate-400"
                      >
                        No fixtures match the current filters.
                      </td>
                    </tr>
                  ) : (
                    visible.map((f) => {
                      // Vision available: the fixture has a linked video URL.
                      // Highlight the whole row orange so it stands out.
                      const hasVision = !!f.video_url;
                      // Live download status from the API overlay (if matched).
                      const st = statusFor(f);
                      return (
                        <tr
                          key={f.id}
                          className={`border-b transition ${
                            hasVision
                              ? "border-orange-200 bg-orange-50 hover:bg-orange-100"
                              : "border-slate-100 hover:bg-slate-50"
                          }`}
                        >
                        {/* DATE */}
                        <td className="truncate px-3 py-3">
                          {f.fixture_date
                            ? new Date(
                                `${f.fixture_date}T00:00:00`
                              ).toLocaleDateString("en-AU")
                            : "-"}
                        </td>
                        {/* ROUND */}
                        <td className="truncate px-3 py-3">{f.round || "-"}</td>
                        {/* LEAGUE */}
                        <td className="px-3 py-3 align-top">{f.competition}</td>
                        {/* MATCH */}
                        <td className="px-3 py-3 align-top font-medium text-slate-900">
                          {f.video_url ? (
                            <a
                              href={f.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={f.video_name || "Open match video"}
                              className="inline-flex items-center gap-1 hover:text-sky-600"
                            >
                              {f.home_team}
                              {" vs "}
                              {f.away_team}
                              <Video size={13} className="text-sky-500" />
                            </a>
                          ) : (
                            <>
                              {f.home_team}
                              {" vs "}
                              {f.away_team}
                            </>
                          )}
                        </td>
                        {/* STATUS — merged status + progress. Pending →
                            Allocated → NN% → Downloaded (Failed on error). */}
                        <td className="truncate px-3 py-3">
                          {(() => {
                            const m = mergedStatus(st);
                            return (
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${m.classes}`}
                              >
                                {m.label}
                              </span>
                            );
                          })()}
                        </td>
                        {/* SIZE — API-reported size if matched, else the
                            Cloudflare HEAD check on the video. */}
                        <td className="truncate px-3 py-3 text-slate-600">
                          {st?.fileSizeBytes != null && st.fileSizeBytes > 0 ? (
                            formatSize(st.fileSizeBytes)
                          ) : f.video_url ? (
                            formatSize(sizes.get(f.video_url))
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        {/* DOWNLOADED AT (date + time) */}
                        <td className="truncate px-3 py-3 text-slate-500">
                          {st?.downloadCompletedAt ? (
                            new Date(st.downloadCompletedAt).toLocaleString(
                              "en-AU",
                              {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        {/* ASSIGNMENTS — one section per team side (Home /
                            Away). Multiple analysts allowed per side. */}
                        <td className="px-3 py-3 align-top">
                          {(() => {
                            const all = assignments.get(f.id) ?? [];
                            const busy = savingAssign === f.id;

                            // Render one side's chips + add control on a single
                            // compact line: "H  <chips>  +". Team names aren't
                            // repeated here (they're already in the Match
                            // column), keeping the row short.
                            const renderSide = (side: "home" | "away") => {
                              // Legacy rows (teamSide null) show under Home.
                              const list = all.filter((a) =>
                                side === "home"
                                  ? a.teamSide === "home" || a.teamSide === null
                                  : a.teamSide === "away"
                              );
                              const onSide = new Set(
                                list.map((a) => a.analystName.toLowerCase())
                              );
                              const open =
                                addingFixture?.id === f.id &&
                                addingFixture?.side === side;

                              return (
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-3 shrink-0 text-[10px] font-bold text-slate-400"
                                    title={side === "home" ? "Home" : "Away"}
                                  >
                                    {side === "home" ? "H" : "A"}
                                  </span>
                                  {list.map((a) => (
                                    <span
                                      key={a.id}
                                      className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700"
                                    >
                                      {a.analystName}
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => removeAllocation(f.id, a.id)}
                                        title="Remove allocation"
                                        className="text-emerald-500 hover:text-red-600 disabled:opacity-50"
                                      >
                                        <X size={10} />
                                      </button>
                                    </span>
                                  ))}
                                  {open ? (
                                    <select
                                      autoFocus
                                      value=""
                                      disabled={busy}
                                      onChange={(e) => {
                                        if (!e.target.value) return;
                                        const [idStr, loc] =
                                          e.target.value.split("|");
                                        allocate(
                                          f,
                                          Number(idStr),
                                          loc === "Home" ? "Home" : "Office",
                                          side
                                        );
                                      }}
                                      onBlur={() => setAddingFixture(null)}
                                      className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-slate-700 outline-none focus:border-sky-500"
                                    >
                                      <option value="">Select…</option>
                                      {analysts.flatMap((a) => {
                                        if (onSide.has(a.name.toLowerCase()))
                                          return [];
                                        const opts = [];
                                        if (a.homeComputer)
                                          opts.push(
                                            <option
                                              key={`${a.id}-home`}
                                              value={`${a.id}|Home`}
                                            >
                                              {a.name} (Home)
                                            </option>
                                          );
                                        if (a.officeComputer)
                                          opts.push(
                                            <option
                                              key={`${a.id}-office`}
                                              value={`${a.id}|Office`}
                                            >
                                              {a.name} (Office)
                                            </option>
                                          );
                                        return opts;
                                      })}
                                    </select>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        setAddingFixture({ id: f.id, side })
                                      }
                                      title={`Add ${side} analyst`}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-sky-600 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-50"
                                    >
                                      <Plus size={13} />
                                    </button>
                                  )}
                                </div>
                              );
                            };

                            return (
                              <div className="space-y-0.5">
                                {renderSide("home")}
                                {renderSide("away")}
                              </div>
                            );
                          })()}
                        </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
