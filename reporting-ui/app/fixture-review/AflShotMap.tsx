"use client";

// AFL shot map: a half-oval (forward 50) that plots where each shot was taken,
// coloured by outcome (goal / behind / miss). AFL stat events encode shots as
// a located SetShot / ShotInPlay (carrying startX/startY within a
// startWidth × startHeight grid, ~485 × 262) immediately followed by an
// outcome marker (Goal / Behind / RushedBehind) at 0,0 for the same player.
// We pair each located shot with the next outcome event by the same player.
//
// Both teams' shots are recorded in their OWN attacking frame (higher X =
// toward goal), confirmed against real data (both teams average the same X),
// so neither team is mirrored — both plot toward the same goal end.

import { useMemo } from "react";
import type { FixtureStatEvent } from "@/types/fixtureReport";

type Outcome = "goal" | "behind" | "miss";

export type AflShot = {
  uid: number;
  playerName: string;
  playerNumber: number | null;
  teamName: string;
  teamUid: number;
  fx: number; // 0..1 across the grid width (toward goal)
  fy: number; // 0..1 across the grid height
  outcome: Outcome;
};

type Props = {
  events: FixtureStatEvent[];
  homeTeamUid: number | null;
  awayTeamUid: number | null;
  homeTeamName?: string;
  awayTeamName?: string;
  /** uid of the shot active at the current video position (emphasised). */
  activeUid?: number | null;
};

// SVG dimensions. The oval is drawn as a half-ground: the goal end at the TOP,
// play coming up from the bottom. Portrait so it sits neatly above the
// timeline (like the soccer pitch).
const W = 680;
const H = 620;
const PAD = 20;

// Oval geometry. We draw the FORWARD HALF of an AFL oval: the goal line is a
// short straight segment at the top, the boundary bulges out to full width,
// then rounds back in toward a flat-ish bottom (the halfway line). Modelled as
// the lower portion of an ellipse centred ABOVE the visible top, so the shown
// region is wide in the middle and narrows at the goal end — like a real oval.
const CX = W / 2;
const GOAL_Y = PAD + 46; // the goal line (top of play)
const BACK_Y = H - PAD; // halfway line (bottom of the shown half)
// Full-oval ellipse the boundary is sampled from (centre is near GOAL_Y so the
// goal end is the narrow top of the oval and it widens coming down).
const OVAL_CY = GOAL_Y - 10;
const OVAL_RX = (W - PAD * 2) / 2;
const OVAL_RY = BACK_Y - OVAL_CY + 30;

const GOAL_LINE_HALF = 70; // half-width of the goal line at the top

const GOAL_COLOR = "#34d399"; // emerald — goal
const BEHIND_COLOR = "#fbbf24"; // amber — behind
const MISS_COLOR = "#94a3b8"; // slate — miss / out of bounds / rushed
const HOME_RING = "#34d399";
const AWAY_RING = "#fb923c";

const LOCATED = new Set(["setshot", "shotinplay"]);
const OUTCOME = new Set(["goal", "behind", "rushedbehind"]);

function outcomeOf(code: string): Outcome {
  const c = code.toLowerCase();
  if (c === "goal") return "goal";
  if (c === "behind" || c === "rushedbehind") return "behind";
  return "miss";
}

export default function AflShotMap({
  events,
  homeTeamUid,
  awayTeamUid,
  homeTeamName,
  awayTeamName,
  activeUid,
}: Props) {
  // Pair each located shot (SetShot / ShotInPlay) with the next outcome event
  // (Goal / Behind / RushedBehind) by the same player within a short window.
  const shots = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.relativeTime - b.relativeTime);
    const out: AflShot[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      const code = (e.statTypeCode ?? "").toLowerCase();
      if (!LOCATED.has(code)) continue;
      if (!e.startWidth || !e.startHeight) continue; // no location
      // Find the outcome: next event by the same player that is an outcome
      // marker, within ~15s.
      let outcome: Outcome = "miss";
      for (let j = i + 1; j < sorted.length; j++) {
        const n = sorted[j];
        if (n.relativeTime - e.relativeTime > 15) break;
        if (
          n.playerUid === e.playerUid &&
          OUTCOME.has((n.statTypeCode ?? "").toLowerCase())
        ) {
          outcome = outcomeOf(n.statTypeCode ?? "");
          break;
        }
      }
      out.push({
        uid: e.uid,
        playerName: e.playerName ?? "",
        playerNumber: e.playerNumber ?? null,
        teamName: e.teamName ?? "",
        teamUid: e.teamUid ?? 0,
        // Normalise to 0..1 of the shot's own grid. X is toward goal.
        fx: Math.max(0, Math.min(1, e.startX / e.startWidth)),
        fy: Math.max(0, Math.min(1, e.startY / e.startHeight)),
        outcome,
      });
    }
    return out;
  }, [events]);

  // Map a shot's (fx toward goal, fy across) to SVG coords. The goal is at the
  // TOP (y=GOAL_Y); play comes up from the bottom. fx=1 is at the goal line,
  // fx=0 is the back of the shown forward region. fy is across the ground.
  //
  // The ground is an oval, so the usable WIDTH narrows toward the goal end.
  // We scale the across-position by the oval's half-width at that depth so
  // shots stay inside the curved boundary (not in the black corners).
  const toXY = (fx: number, fy: number) => {
    const depth = 1 - fx; // 0 at goal line, 1 at the back of the region
    const y = GOAL_Y + depth * (BACK_Y - GOAL_Y);
    // Oval half-width at this y, as a fraction of the max half-width. Model the
    // boundary as the lower arc of an ellipse centred below the goal line.
    const ny = (y - OVAL_CY) / OVAL_RY; // -? .. +1 within the ellipse
    const halfFrac = Math.sqrt(Math.max(0, 1 - ny * ny));
    const halfW = OVAL_RX * halfFrac;
    const x = CX + (fy - 0.5) * 2 * halfW * 0.9; // 0.9 keeps a small margin
    return { x, y };
  };

  const goals = shots.filter((s) => s.outcome === "goal").length;
  const behinds = shots.filter((s) => s.outcome === "behind").length;

  // Boundary path: the goal line (straight, across the top) then the oval's
  // lower arc curving out to full width and rounding back to the halfway line.
  // Sampled from the modelling ellipse so the shot-placement (toXY) and the
  // drawn boundary use the exact same curve.
  const boundaryPath = useMemo(() => {
    const pts: string[] = [];
    // Start at the LEFT end of the goal line.
    pts.push(`M ${CX - GOAL_LINE_HALF} ${GOAL_Y}`);
    // Across the top to the right end of the goal line.
    pts.push(`L ${CX + GOAL_LINE_HALF} ${GOAL_Y}`);
    // Down the RIGHT side following the ellipse, then across the bottom and up
    // the LEFT side. Sample y from GOAL_Y down to BACK_Y and back up.
    const steps = 40;
    // Right side: top -> bottom.
    for (let i = 0; i <= steps; i++) {
      const y = GOAL_Y + (i / steps) * (BACK_Y - GOAL_Y);
      const ny = (y - OVAL_CY) / OVAL_RY;
      const half = OVAL_RX * Math.sqrt(Math.max(0, 1 - ny * ny));
      pts.push(`L ${CX + half} ${y}`);
    }
    // Left side: bottom -> top.
    for (let i = steps; i >= 0; i--) {
      const y = GOAL_Y + (i / steps) * (BACK_Y - GOAL_Y);
      const ny = (y - OVAL_CY) / OVAL_RY;
      const half = OVAL_RX * Math.sqrt(Math.max(0, 1 - ny * ny));
      pts.push(`L ${CX - half} ${y}`);
    }
    pts.push("Z");
    return pts.join(" ");
  }, []);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full rounded-xl"
        style={{ background: "#0b3d1f", maxHeight: 420, height: "auto" }}
      >
        {/* ---- Ground markings (match a real AFL forward 50) ---- */}
        <g fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={2.5}>
          {/* Boundary: goal line straight across the top, then the oval curves
              out to full width and rounds back toward the halfway line.
              Built from the lower arc of the modelling ellipse. */}
          <path d={boundaryPath} fill="rgba(255,255,255,0.04)" />

          {/* Goal + point posts (two tall centre goal posts, two shorter point
              posts), standing ABOVE the goal line. */}
          <g strokeWidth={3}>
            <line x1={CX - 10} y1={GOAL_Y} x2={CX - 10} y2={GOAL_Y - 34} />
            <line x1={CX + 10} y1={GOAL_Y} x2={CX + 10} y2={GOAL_Y - 34} />
            <line x1={CX - 34} y1={GOAL_Y} x2={CX - 34} y2={GOAL_Y - 22} />
            <line x1={CX + 34} y1={GOAL_Y} x2={CX + 34} y2={GOAL_Y - 22} />
          </g>

          {/* Goal square (in front of the goals). */}
          <rect x={CX - 10} y={GOAL_Y} width={20} height={34} />

          {/* 50m arc — a wide arc sweeping across the forward line. */}
          <path
            d={`M ${CX - 215} ${GOAL_Y + 4} A 215 190 0 0 0 ${CX + 215} ${GOAL_Y + 4}`}
            stroke="rgba(125,211,252,0.9)"
            strokeWidth={3}
          />
        </g>
        {/* "50" labels on the arc. */}
        <g fill="rgba(125,211,252,0.9)" fontSize="20" fontWeight="700">
          <text x={CX - 150} y={GOAL_Y + 150} textAnchor="middle">
            50
          </text>
          <text x={CX + 150} y={GOAL_Y + 150} textAnchor="middle">
            50
          </text>
        </g>

        {/* Shots. */}
        {shots.map((s) => {
          const { x, y } = toXY(s.fx, s.fy);
          const fill =
            s.outcome === "goal"
              ? GOAL_COLOR
              : s.outcome === "behind"
                ? BEHIND_COLOR
                : MISS_COLOR;
          const ring =
            s.teamUid === homeTeamUid
              ? HOME_RING
              : s.teamUid === awayTeamUid
                ? AWAY_RING
                : "transparent";
          const active = activeUid != null && s.uid === activeUid;
          const who =
            [s.playerNumber != null ? `#${s.playerNumber}` : "", s.playerName]
              .filter(Boolean)
              .join(" ");
          return (
            <g key={s.uid}>
              <title>{`${s.outcome.toUpperCase()} — ${who} (${s.teamName})`}</title>
              {active && (
                <circle cx={x} cy={y} r={16} fill={fill} fillOpacity={0.3} />
              )}
              <circle
                cx={x}
                cy={y}
                r={active ? 9 : 6}
                fill={fill}
                stroke={active ? "white" : ring}
                strokeWidth={active ? 2.5 : 2}
              />
            </g>
          );
        })}
      </svg>

      {/* Legend. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: GOAL_COLOR }} />
          Goal ({goals})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: BEHIND_COLOR }} />
          Behind ({behinds})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: MISS_COLOR }} />
          Miss
        </span>
        <span className="text-slate-500">·</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: HOME_RING }} />
          {homeTeamName || "Home"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: AWAY_RING }} />
          {awayTeamName || "Away"}
        </span>
        <span>· {shots.length} shots</span>
      </div>
    </div>
  );
}
