// Route Handler: GET /api/fixture-timeline/{fixtureId}
//
// Pulls a fixture's full stat timeline from the public Premier Data S3 bucket
// and returns it as JSON. This gives the dashboard (and any client) a single
// same-origin endpoint to read a fixture timeline without each caller knowing
// the S3 URL shape.
//
// Optional query params filter the returned events (the counts always reflect
// the filtered set):
//   ?quarter=1            only quarter 1
//   ?teamUid=8888         only one team's events
//   ?playerUid=132777     only one player's events
//   ?statType=HitOut      only one statTypeCode (case-insensitive)
//
// Route Handlers are dynamic (not cached) by default in this Next.js version,
// which is what we want: a live fixture's report changes as the match runs.

import type { NextRequest } from "next/server";
import { getFixtureTimeline } from "@/lib/api/fixtureReports";
import type { FixtureStatEvent } from "@/types/fixtureReport";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/fixture-timeline/[fixtureId]">
) {
  const { fixtureId } = await ctx.params;

  // The id in the S3 path is numeric; reject anything else early with a clear
  // 400 instead of fetching a URL that can't exist.
  const id = Number(fixtureId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json(
      { error: `Invalid fixture id: ${fixtureId}` },
      { status: 400 }
    );
  }

  try {
    const timeline = await getFixtureTimeline(id, { cache: "no-store" });

    // Apply optional filters from the query string.
    const params = request.nextUrl.searchParams;
    const quarter = params.get("quarter");
    const teamUid = params.get("teamUid");
    const playerUid = params.get("playerUid");
    const statType = params.get("statType");

    let events: FixtureStatEvent[] = timeline.events;
    if (quarter != null) {
      const q = Number(quarter);
      events = events.filter((e) => e.quarter === q);
    }
    if (teamUid != null) {
      const t = Number(teamUid);
      events = events.filter((e) => e.teamUid === t);
    }
    if (playerUid != null) {
      const p = Number(playerUid);
      events = events.filter((e) => e.playerUid === p);
    }
    if (statType != null) {
      const s = statType.toLowerCase();
      events = events.filter((e) => e.statTypeCode.toLowerCase() === s);
    }

    return Response.json({
      fixtureId: timeline.fixtureId,
      meta: timeline.meta,
      eventCount: events.length,
      events,
    });
  } catch (err) {
    // A 404 from S3 (no report for that id) and any other fetch/parse failure
    // both surface here. Report as 502 (upstream failure) with the message so
    // the caller can distinguish "not found upstream" from a bad request.
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: `Could not load timeline for fixture ${id}`, detail: message },
      { status: 502 }
    );
  }
}
