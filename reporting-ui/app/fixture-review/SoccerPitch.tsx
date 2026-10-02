"use client";

// Soccer pitch map: plots coded stat events at the grid location they were
// clicked. Each JADE/S3 stat event carries a grid position:
//   - startWidth × startHeight  : the grid dimensions for that event (soccer
//     uses ~10 × 8, with 1-based cells that can slightly overshoot — see below)
//   - startX / startY           : the START cell (where the action began)
//   - endX / endY               : the END cell (destination), for stats that
//     travel (passes, carries, crosses…). Point stats have end == start (or 0).
//
// We normalise each coordinate to 0..1 of its own event's grid so a mix of
// grids plots consistently, then draw:
//   - a DOT at the start for point events (no meaningful end), and
//   - an ARROW start→end for events that travel.
// Colour is by team (home / away) to match the timeline.

import { useMemo } from "react";
import type { FixtureStatEvent } from "@/types/fixtureReport";

export type PitchEvent = Pick<
  FixtureStatEvent,
  | "uid"
  | "statTypeName"
  | "playerName"
  | "playerNumber"
  | "teamName"
  | "teamUid"
  | "startWidth"
  | "startHeight"
  | "startX"
  | "startY"
  | "endX"
  | "endY"
>;

type Props = {
  events: PitchEvent[];
  /** teamUid rendered attacking left→right (home); the other attacks right→left. */
  homeTeamUid: number | null;
  awayTeamUid: number | null;
  /** Display names for the legend. */
  homeTeamName?: string;
  awayTeamName?: string;
  /**
   * Emphasise markers (bigger dot + glow) — used when a single live event is
   * shown in sync with video playback, so it reads clearly at a glance.
   */
  emphasize?: boolean;
  /** CSS max-height for the pitch SVG (keeps aspect ratio, letterboxes). */
  maxHeight?: number | string;
};

// Pitch drawing constants (SVG user units). The playing area is PAD inset from
// the edge; a 105×68 m pitch ratio keeps the markings proportional.
const W = 1050;
const H = 680;
const PAD = 20;
const PW = W - PAD * 2; // playing width
const PH = H - PAD * 2; // playing height

// Normalise a cell coordinate (1-based, can overshoot the nominal grid size by
// ~1 on each edge) to a 0..1 fraction. We treat the usable extent as
// [0, size+2] and clamp, which lands JADE's 1..size+2 cells sensibly inside
// the pitch. Returns null when there's no grid (size 0) so the event is skipped.
function norm(cell: number, size: number): number | null {
  if (!size || size <= 0) return null;
  const extent = size + 2;
  const v = cell / extent;
  return Math.max(0, Math.min(1, v));
}

// Map a normalised (fx, fy) in 0..1 to SVG pitch coordinates.
//
// NOTE: the feed records each team's coordinates in its OWN attacking frame
// (confirmed against real data — both teams average the same startX ≈ 0.55 of
// the width, rather than mirror-image averages). So "higher X = closer to the
// opponent goal" holds for BOTH teams, and we must NOT flip the away team —
// doing so put the two teams on opposite ends. Both are drawn attacking the
// same direction (left → right).
function toXY(fx: number, fy: number): { x: number; y: number } {
  return { x: PAD + fx * PW, y: PAD + fy * PH };
}

const HOME_COLOR = "#34d399"; // emerald — matches timeline home tint
const AWAY_COLOR = "#fb923c"; // orange — matches timeline away tint
const NEUTRAL_COLOR = "#94a3b8"; // slate — unknown team

export default function SoccerPitch({
  events,
  homeTeamUid,
  awayTeamUid,
  homeTeamName,
  awayTeamName,
  emphasize = false,
  maxHeight = "none",
}: Props) {
  const plotted = useMemo(() => {
    const out: {
      key: string;
      sx: number;
      sy: number;
      ex: number | null;
      ey: number | null;
      color: string;
      title: string;
    }[] = [];
    for (const e of events) {
      const fsx = norm(e.startX, e.startWidth);
      const fsy = norm(e.startY, e.startHeight);
      if (fsx == null || fsy == null) continue; // no coordinates for this event

      const color =
        e.teamUid === homeTeamUid
          ? HOME_COLOR
          : e.teamUid === awayTeamUid
            ? AWAY_COLOR
            : NEUTRAL_COLOR;

      const start = toXY(fsx, fsy);

      // End point (only when it differs from start — a travelling event).
      const fex = norm(e.endX, e.startWidth);
      const fey = norm(e.endY, e.startHeight);
      let ex: number | null = null;
      let ey: number | null = null;
      if (fex != null && fey != null && (e.endX !== e.startX || e.endY !== e.startY)) {
        const end = toXY(fex, fey);
        ex = end.x;
        ey = end.y;
      }

      const who =
        [e.playerNumber != null ? `#${e.playerNumber}` : "", e.playerName]
          .filter(Boolean)
          .join(" ") || e.teamName || "";
      out.push({
        key: String(e.uid),
        sx: start.x,
        sy: start.y,
        ex,
        ey,
        color,
        title: `${e.statTypeName}${who ? ` — ${who}` : ""}`,
      });
    }
    return out;
  }, [events, homeTeamUid, awayTeamUid]);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full rounded-xl"
        // Cap the pitch height so it doesn't dominate the column — the SVG
        // keeps its aspect ratio and letterboxes within this height, leaving
        // room for the timeline below to line up with the video.
        style={{ background: "#0b3d1f", maxHeight: maxHeight, height: "auto" }}
      >
        {/* Pitch markings (white lines). */}
        <g
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={2}
        >
          {/* Outer boundary */}
          <rect x={PAD} y={PAD} width={PW} height={PH} />
          {/* Halfway line */}
          <line x1={W / 2} y1={PAD} x2={W / 2} y2={H - PAD} />
          {/* Centre circle + spot */}
          <circle cx={W / 2} cy={H / 2} r={70} />
          <circle cx={W / 2} cy={H / 2} r={3} fill="rgba(255,255,255,0.55)" />
          {/* Left penalty box */}
          <rect x={PAD} y={H / 2 - 150} width={150} height={300} />
          <rect x={PAD} y={H / 2 - 70} width={55} height={140} />
          {/* Right penalty box */}
          <rect x={W - PAD - 150} y={H / 2 - 150} width={150} height={300} />
          <rect x={W - PAD - 55} y={H / 2 - 70} width={55} height={140} />
          {/* Goals */}
          <rect x={PAD - 10} y={H / 2 - 35} width={10} height={70} />
          <rect x={W - PAD} y={H / 2 - 35} width={10} height={70} />
        </g>

        {/* Arrow marker for travelling events. */}
        <defs>
          <marker
            id="pitch-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {/* Events. */}
        {plotted.map((p) => (
          <g key={p.key} color={p.color}>
            <title>{p.title}</title>
            {p.ex != null && p.ey != null ? (
              <line
                x1={p.sx}
                y1={p.sy}
                x2={p.ex}
                y2={p.ey}
                stroke={p.color}
                strokeWidth={emphasize ? 4 : 2.5}
                strokeOpacity={0.9}
                markerEnd="url(#pitch-arrow)"
              />
            ) : null}
            {emphasize && (
              <circle
                cx={p.sx}
                cy={p.sy}
                r={16}
                fill={p.color}
                fillOpacity={0.25}
              />
            )}
            <circle
              cx={p.sx}
              cy={p.sy}
              r={emphasize ? 9 : 6}
              fill={p.color}
              fillOpacity={0.95}
              stroke={emphasize ? "white" : "none"}
              strokeWidth={emphasize ? 2 : 0}
            />
          </g>
        ))}
      </svg>

      {/* Legend. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: HOME_COLOR }} />
          {homeTeamName || "Home"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: AWAY_COLOR }} />
          {awayTeamName || "Away"}
        </span>
        <span className="text-slate-500">attacking →</span>
        {!emphasize && (
          <span>{plotted.length.toLocaleString()} located events</span>
        )}
      </div>
    </div>
  );
}
