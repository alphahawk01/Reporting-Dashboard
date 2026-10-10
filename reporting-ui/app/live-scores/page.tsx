"use client";

// Live Scores — lists all fixtures for the NTFL Premier Men's grade, pulled
// from the official PlayHQ REST API through our Cloudflare Worker (which holds
// the API key). Scores and statuses come straight from the grade games feed;
// while any match is in progress the list auto-refreshes every 2 minutes so
// live scores update without a reload.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Radio,
  Loader2,
  AlertTriangle,
  RefreshCw,
  MapPin,
  ExternalLink,
} from "lucide-react";

import {
  getGradeGames,
  sides,
  goalsBehinds,
  isLive,
  scheduleDate,
  scheduleLabel,
  type PlayHqGame,
  type GameStatus,
} from "@/lib/api/playhq";

// Poll interval while any game is live (ms). 2 minutes — modest load, and the
// Worker's edge cache means concurrent viewers share one upstream call.
const LIVE_POLL_MS = 120_000;

function statusBadge(status: GameStatus): { label: string; cls: string } {
  const s = String(status).toUpperCase();
  if (s === "IN_PROGRESS" || s === "LIVE")
    return { label: "LIVE", cls: "bg-red-100 text-red-700 ring-1 ring-red-300" };
  if (s === "FINAL")
    return { label: "Final", cls: "bg-slate-100 text-slate-600" };
  if (s === "UPCOMING")
    return { label: "Upcoming", cls: "bg-blue-50 text-blue-700" };
  if (s === "ABANDONED" || s === "CANCELLED" || s === "POSTPONED")
    return { label: s.charAt(0) + s.slice(1).toLowerCase(), cls: "bg-amber-50 text-amber-700" };
  return { label: s, cls: "bg-slate-100 text-slate-600" };
}

// Winner side for emphasising the score of the team that won.
function wonSide(game: PlayHqGame): "home" | "away" | null {
  const { home, away } = sides(game);
  if (home?.outcome === "WON") return "home";
  if (away?.outcome === "WON") return "away";
  return null;
}

function GameRow({ game }: { game: PlayHqGame }) {
  const { home, away } = sides(game);
  const badge = statusBadge(game.status);
  const live = isLive(game.status);
  const won = wonSide(game);
  const showScore =
    game.status !== "UPCOMING" &&
    (home?.scoreTotal != null || away?.scoreTotal != null);

  const teamRow = (c: typeof home, side: "home" | "away") => (
    <div className="flex items-center justify-between gap-3">
      <span
        className={`truncate text-sm ${
          won === side ? "font-bold text-slate-900" : "font-medium text-slate-700"
        }`}
      >
        {c?.name ?? "TBC"}
      </span>
      {showScore && (
        <span className="flex items-baseline gap-1.5 tabular-nums">
          <span className="text-xs text-slate-400">{goalsBehinds(c)}</span>
          <span
            className={`text-base ${
              won === side ? "font-bold text-slate-900" : "font-semibold text-slate-600"
            }`}
          >
            {c?.scoreTotal ?? "-"}
          </span>
        </span>
      )}
    </div>
  );

  return (
    <div
      className={`rounded-xl border p-3.5 ${
        live ? "border-red-300 bg-red-50/40" : "border-slate-200 bg-white"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{scheduleLabel(game)}</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}
        >
          {live && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
          )}
          {badge.label}
        </span>
      </div>
      <div className="space-y-1.5">
        {teamRow(home, "home")}
        {teamRow(away, "away")}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-400">
        <span className="flex min-w-0 items-center gap-1">
          <MapPin size={12} className="shrink-0" />
          <span className="truncate">{game.venue?.name ?? "Venue TBC"}</span>
        </span>
        <a
          href={game.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 text-slate-400 hover:text-slate-600"
        >
          Game centre <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

export default function LiveScoresPage() {
  const [games, setGames] = useState<PlayHqGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [roundFilter, setRoundFilter] = useState<string>("all");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await getGradeGames();
      setGames(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load fixtures."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    load();
  }, [load]);

  const anyLive = useMemo(
    () => games.some((g) => isLive(g.status)),
    [games]
  );

  // Auto-poll ONLY while a match is live. Interval is cleared when nothing is
  // live, so a finished round doesn't keep hitting the API.
  const liveRef = useRef(anyLive);
  liveRef.current = anyLive;
  useEffect(() => {
    if (!anyLive) return;
    const t = setInterval(() => {
      if (liveRef.current) load(true);
    }, LIVE_POLL_MS);
    return () => clearInterval(t);
  }, [anyLive, load]);

  // Rounds present, ordered by their numeric suffix (Round 1, 2, …), finals last.
  const rounds = useMemo(() => {
    const names = Array.from(new Set(games.map((g) => g.round?.name).filter(Boolean)));
    const num = (n: string) => {
      const m = n.match(/(\d+)/);
      return m ? Number(m[1]) : 9999;
    };
    return names.sort((a, b) => num(a) - num(b));
  }, [games]);

  // Default the round filter to the round that has live games, else the most
  // recent round with activity (latest scheduled), else "all".
  const didDefaultRound = useRef(false);
  useEffect(() => {
    if (didDefaultRound.current || games.length === 0) return;
    didDefaultRound.current = true;
    const liveGame = games.find((g) => isLive(g.status));
    if (liveGame) {
      setRoundFilter(liveGame.round.name);
      return;
    }
    // Most recent round by latest schedule date.
    let latest: { round: string; ms: number } | null = null;
    for (const g of games) {
      const d = scheduleDate(g);
      if (!d) continue;
      if (!latest || d.getTime() > latest.ms)
        latest = { round: g.round.name, ms: d.getTime() };
    }
    if (latest) setRoundFilter(latest.round);
  }, [games]);

  const visible = useMemo(() => {
    const list =
      roundFilter === "all"
        ? games
        : games.filter((g) => g.round?.name === roundFilter);
    // Within a round, order by kickoff time.
    return [...list].sort((a, b) => {
      const da = scheduleDate(a)?.getTime() ?? 0;
      const db = scheduleDate(b)?.getTime() ?? 0;
      return da - db;
    });
  }, [games, roundFilter]);

  const selectClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500";

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
            <Radio size={26} /> Live Scores
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            NTFL Premier Men&rsquo;s fixtures and scores, straight from PlayHQ.
            {anyLive
              ? " A match is live — scores refresh automatically every 2 minutes."
              : " Scores update when matches are in progress."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-slate-400">
              Updated {lastUpdated.toLocaleTimeString("en-AU")}
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Round filter */}
      {rounds.length > 0 && (
        <div className="mb-5 flex items-center gap-3">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Round
          </label>
          <select
            value={roundFilter}
            onChange={(e) => setRoundFilter(e.target.value)}
            className={selectClass}
          >
            <option value="all">All rounds</option>
            {rounds.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <span className="text-sm text-slate-400">
            {visible.length} {visible.length === 1 ? "game" : "games"}
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading fixtures…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} /> {error}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center text-sm text-slate-500">
          No fixtures to show.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((g) => (
            <GameRow key={g.id} game={g} />
          ))}
        </div>
      )}
    </div>
  );
}
