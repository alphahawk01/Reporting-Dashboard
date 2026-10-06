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
const H = 760;
const PAD = 24;

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

  // Map a shot's (fx toward goal, fy across) to SVG coords on a half oval with
  // the goal at the TOP. fx=1 (at goal) -> near the top; fy -> left/right.
  const toXY = (fx: number, fy: number) => {
    const x = PAD + fy * (W - PAD * 2);
    // fx is distance toward goal; goal at top, so invert.
    const y = PAD + (1 - fx) * (H - PAD * 2);
    return { x, y };
  };

  const goals = shots.filter((s) => s.outcome === "goal").length;
  const behinds = shots.filter((s) => s.outcome === "behind").length;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full rounded-xl"
        style={{ background: "#0b3d1f", maxHeight: 420, height: "auto" }}
      >
        {/* Half-oval boundary (an ellipse clipped to the lower half shown). */}
        <g fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={2}>
          {/* Oval outline — a tall ellipse; we show the forward portion. */}
          <ellipse
            cx={W / 2}
            cy={H / 2}
            rx={(W - PAD * 2) / 2}
            ry={(H - PAD * 2) / 2}
          />
          {/* Goal square + 50m arc at the TOP (goal end). */}
          {/* Goal line */}
          <line x1={W / 2 - 36} y1={PAD + 6} x2={W / 2 + 36} y2={PAD + 6} />
          {/* Goal posts (four posts marked as ticks) */}
          <line x1={W / 2 - 36} y1={PAD} x2={W / 2 - 36} y2={PAD + 14} />
          <line x1={W / 2 - 12} y1={PAD} x2={W / 2 - 12} y2={PAD + 14} />
          <line x1={W / 2 + 12} y1={PAD} x2={W / 2 + 12} y2={PAD + 14} />
          <line x1={W / 2 + 36} y1={PAD} x2={W / 2 + 36} y2={PAD + 14} />
          {/* Goal square */}
          <rect x={W / 2 - 12} y={PAD + 6} width={24} height={40} />
          {/* 50m arc */}
          <path
            d={`M ${W / 2 - 170} ${PAD + 6} A 170 150 0 0 0 ${W / 2 + 170} ${PAD + 6}`}
          />
          {/* Centre square hint (lower) */}
          <line
            x1={W / 2}
            y1={H / 2 + 90}
            x2={W / 2}
            y2={H - PAD}
            strokeDasharray="4 6"
          />
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
