"use client";

// AFL shot map: plots where each shot was taken on the SAME forward-50 ground
// graphic the TeamTracker platform uses (public/afl_ground.jpg), coloured by
// outcome (goal / behind / miss).
//
// AFL stat events encode shots as a located SetShot / ShotInPlay (carrying
// startX/startY within a startWidth × startHeight grid, ~485 × 262) immediately
// followed by an outcome marker (Goal / Behind / RushedBehind) at 0,0 for the
// same player. We pair each located shot with the next outcome by that player.
//
// Both teams' shots are in their OWN attacking frame (higher X = toward goal),
// so neither team is mirrored — both plot toward the same goal end (the top).

import { useMemo } from "react";
import type { FixtureStatEvent } from "@/types/fixtureReport";

type Outcome = "goal" | "behind" | "miss";

export type AflShot = {
  uid: number;
  playerName: string;
  playerNumber: number | null;
  playerUid: number;
  teamName: string;
  teamUid: number;
  quarter: number;
  shotName: string; // the SetShot / ShotInPlay statTypeName
  outcomeName: string; // the Goal / Behind / … statTypeName (if paired)
  acrossFrac: number; // startX / startWidth  (0 left .. 1 right)
  depthFrac: number; // startY / startHeight (0 at goal .. 1 out field)
  outcome: Outcome;
};

type Props = {
  /** FULL event list (needed for shot→outcome pairing). */
  events: FixtureStatEvent[];
  homeTeamUid: number | null;
  awayTeamUid: number | null;
  homeTeamName?: string;
  awayTeamName?: string;
  /** uid of the shot active at the current video position (emphasised). */
  activeUid?: number | null;
  /** Filters (mirror the timeline + the shot map's own team filter). A shot is
      shown only when it passes every active filter. */
  quarter?: number | "all";
  playerUid?: number | "all";
  /** statTypeName; matches the shot's SetShot name OR its outcome name. */
  event?: string;
  teamUid?: number | "all";
  /** Clicking a shot dot seeks the video + timeline to that shot's event. */
  onShotClick?: (uid: number) => void;
};

const GOAL_COLOR = "#22c55e"; // green — goal
const BEHIND_COLOR = "#fbbf24"; // amber — behind
const MISS_COLOR = "#e2e8f0"; // light — miss / out of bounds / rushed
const HOME_RING = "#16a34a";
const AWAY_RING = "#ea580c";

const LOCATED = new Set(["setshot", "shotinplay"]);
const OUTCOME = new Set(["goal", "behind", "rushedbehind"]);

function outcomeOf(code: string): Outcome {
  const c = code.toLowerCase();
  if (c === "goal") return "goal";
  if (c === "behind" || c === "rushedbehind") return "behind";
  return "miss";
}

// Map a shot onto the ground IMAGE as top/left percentages.
//
// Coordinate system (confirmed against real AFL reports): within the shot's
// startWidth × startHeight grid (~485 × 262),
//   startX = ACROSS the ground (left↔right), centred ~240/485 in line with goal
//   startY = DEPTH from goal (small = close to goal, large = out toward 50m)
// The goal is at the TOP-CENTRE of the image, play coming out of it downward.
// So we map:
//   acrossFrac = startX / startWidth  -> LEFT %  (0 left .. 1 right)
//   depthFrac  = startY / startHeight -> TOP  %  (0 at goal .. 1 out field)
//
// IMPORTANT: the coordinate grid (485 × 262) covers a WIDER area than the
// visible forward-50 image — the image is a zoomed-in centre of the full AFL
// coordinate space. So the grid maps to a region that extends BEYOND the image
// edges; this is what spreads the (naturally central) shot cluster out across
// the forward 50 to match the TeamTracker platform's shot map.
//
//   leftPct = AX + acrossFrac * BX   (acrossFrac = startX / startWidth)
//   topPct  = AY + depthFrac  * BY   (depthFrac  = startY / startHeight)
//
// Calibrated to the ground-image LANDMARKS on afl_ground.jpg (so shots line up
// with the goal square and 50m arc), cross-checked against the platform's shot
// map for fixture 32659:
//   - ACROSS: grid centre (acrossFrac 0.5) maps to image centre (50%), by
//     symmetry — AX = 50 - 0.5*BX. BX = 150 fans the full width to the wings.
//   - DEPTH: near-goal shots (depthFrac ~0.305) sit just below the goal square
//     (~38% down); the deepest shots (~0.767) reach the 50m arc (~68% down).
//     Solved -> topPct = 18.2 + depthFrac * 64.9.
const BX = 150;
const AX = 50 - 0.5 * BX; // -25 : keeps grid centre at image centre
const AY = 18.2;
const BY = 64.9;

function shotPosition(
  acrossFrac: number,
  depthFrac: number
): { topPct: number; leftPct: number } {
  const leftPct = AX + acrossFrac * BX;
  const topPct = AY + depthFrac * BY;
  return { topPct, leftPct };
}

export default function AflShotMap({
  events,
  homeTeamUid,
  awayTeamUid,
  homeTeamName,
  awayTeamName,
  activeUid,
  quarter = "all",
  playerUid = "all",
  event = "all",
  teamUid = "all",
  onShotClick,
}: Props) {
  // Pair each located shot (SetShot / ShotInPlay) with the next outcome event
  // (Goal / Behind / RushedBehind) by the same player within a short window.
  // Built from the FULL event list so pairing isn't broken by filters.
  const allShots = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.relativeTime - b.relativeTime);
    const out: AflShot[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      const code = (e.statTypeCode ?? "").toLowerCase();
      if (!LOCATED.has(code)) continue;
      if (!e.startWidth || !e.startHeight) continue; // no location
      let outcome: Outcome = "miss";
      let outcomeName = "";
      for (let j = i + 1; j < sorted.length; j++) {
        const n = sorted[j];
        if (n.relativeTime - e.relativeTime > 15) break;
        if (
          n.playerUid === e.playerUid &&
          OUTCOME.has((n.statTypeCode ?? "").toLowerCase())
        ) {
          outcome = outcomeOf(n.statTypeCode ?? "");
          outcomeName = n.statTypeName ?? "";
          break;
        }
      }
      out.push({
        uid: e.uid,
        playerName: e.playerName ?? "",
        playerNumber: e.playerNumber ?? null,
        playerUid: e.playerUid ?? 0,
        teamName: e.teamName ?? "",
        teamUid: e.teamUid ?? 0,
        quarter: e.quarter ?? 0,
        shotName: e.statTypeName ?? "",
        outcomeName,
        acrossFrac: Math.max(0, Math.min(1, e.startX / e.startWidth)),
        depthFrac: Math.max(0, Math.min(1, e.startY / e.startHeight)),
        outcome,
      });
    }
    return out;
  }, [events]);

  // Apply the active filters: quarter / player / event (matches the SetShot
  // name OR the outcome name) / team.
  const shots = useMemo(() => {
    return allShots.filter((s) => {
      if (quarter !== "all" && s.quarter !== quarter) return false;
      if (playerUid !== "all" && s.playerUid !== playerUid) return false;
      if (teamUid !== "all" && s.teamUid !== teamUid) return false;
      if (
        event !== "all" &&
        s.shotName !== event &&
        s.outcomeName !== event
      )
        return false;
      return true;
    });
  }, [allShots, quarter, playerUid, event, teamUid]);

  const goals = shots.filter((s) => s.outcome === "goal").length;
  const behinds = shots.filter((s) => s.outcome === "behind").length;

  return (
    <div>
      {/* The ground image (same graphic as the TeamTracker platform) with the
          shot dots overlaid as an absolutely-positioned layer. The team filter
          lives on the page (passed in via teamUid); quarter/player/event come
          from the timeline filters. */}
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{ aspectRatio: "752 / 421" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/afl_ground.jpg"
          alt="AFL forward 50"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {shots.map((s) => {
          const { topPct, leftPct } = shotPosition(s.acrossFrac, s.depthFrac);
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
                : "rgba(0,0,0,0.4)";
          const active = activeUid != null && s.uid === activeUid;
          const who =
            [s.playerNumber != null ? `#${s.playerNumber}` : "", s.playerName]
              .filter(Boolean)
              .join(" ");
          const size = active ? 18 : 13;
          return (
            <button
              key={s.uid}
              type="button"
              onClick={() => onShotClick?.(s.uid)}
              title={`${s.outcome.toUpperCase()} — ${who} (${s.teamName}) — click to jump the video here`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full p-0 ${
                onShotClick ? "cursor-pointer hover:brightness-110" : ""
              }`}
              style={{
                top: `${topPct}%`,
                left: `${leftPct}%`,
                width: size,
                height: size,
                background: fill,
                border: `2px solid ${active ? "#ffffff" : ring}`,
                boxShadow: active
                  ? "0 0 0 4px rgba(255,255,255,0.35)"
                  : "0 1px 2px rgba(0,0,0,0.5)",
              }}
            />
          );
        })}
      </div>

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
