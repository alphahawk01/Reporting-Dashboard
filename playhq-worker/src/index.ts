// PlayHQ live-scores bridge — a Cloudflare Worker that proxies the PlayHQ
// spectator GraphQL endpoint behind your own domain, with validation, a short
// edge cache (so 3–4 fixtures polled every ~2 min never hammer PlayHQ), CORS
// for the dashboard, and sane error/back-off handling.
//
// Routes (GET):
//   /api/fixtures/:id/live-scores   full game payload (score, periods, clock)
//   /api/fixtures/:id/status        just { id, status, updatedAt }
//   /health                         liveness probe
//
// The upstream call is the same POST you ran with cURL, kept server-side so the
// query, headers and tenant live in one place and the browser never talks to
// PlayHQ directly.

export interface Env {
  // Comma-separated list of allowed browser origins for CORS, e.g.
  // "https://your-dashboard.example,https://www.yourdomain.com.au". Set in
  // wrangler.toml [vars] or as a secret. "*" allows any origin (fine for a
  // read-only public score, but prefer listing your real origins).
  ALLOWED_ORIGINS?: string;
  // PlayHQ tenant (default "afl"). Override per-deployment if you query other
  // sports/competitions.
  PHQ_TENANT?: string;
  // Seconds to cache each fixture response at the edge. Default 90 — below your
  // 2-minute poll interval, so a poll always gets fresh-ish data but repeated
  // dashboard opens within the window are served from cache.
  CACHE_TTL_SECONDS?: string;
  // PlayHQ REST API key (official API). A SECRET — set with
  // `wrangler secret put PHQ_API_KEY`, never committed. Required for the
  // /api/grades/:id/games endpoint.
  PHQ_API_KEY?: string;
}

const PLAYHQ_URL = "https://spectator.playhq.com/graphql";
const PLAYHQ_REST = "https://api.playhq.com/v1";

// The GraphQL document from your cURL request, verbatim (whitespace trimmed).
const GAME_QUERY = `query game($id: ID!, $scope: PeriodScore) { game(id: $id) { id status updatedAt lastEventRecordedAt statistics { home { statisticsV2 { type { type value } count } } away { statisticsV2 { type { type value } count } } } result { home { statistics { type { value } count } periods(scope: $scope) { period { label shortName value } statistics { type { type value } count } type role closureStatus overtimeSequenceNo } } away { statistics { type { value } count } periods(scope: $scope) { period { label shortName value } statistics { type { type value } count } type role closureStatus overtimeSequenceNo } } currentPeriod { value primarySide } } clock { overtimeSequenceNo period periodValue status time lastUpdatedAt } } }`;

// A PlayHQ fixture/game id is a short alphanumeric token (e.g. "ab5ae0c9").
// Only accept that shape so the id can't be used to smuggle anything upstream.
const ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;

function corsHeaders(env: Env, requestOrigin: string | null): HeadersInit {
  const allowed = (env.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowAny = allowed.includes("*");
  const origin =
    allowAny || !requestOrigin
      ? allowAny
        ? "*"
        : (allowed[0] ?? "*")
      : allowed.includes(requestOrigin)
        ? requestOrigin
        : allowed[0] ?? "null";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(
  body: unknown,
  status: number,
  extra: HeadersInit = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

// A compact, normalised live-score shape derived from the spectator payload,
// so the dashboard doesn't have to parse the deep GraphQL structure. Scores
// come from result.{home,away}.statistics (TOTAL_SCORE/GOALS/BEHINDS) and the
// clock from clock.{period,time,status}.
type NormalisedLive = {
  id: string;
  status: string | null;
  clock: { period: string | null; time: string | null; status: string | null };
  home: { total: number | null; goals: number | null; behinds: number | null };
  away: { total: number | null; goals: number | null; behinds: number | null };
};

// Pull a stat value out of a spectator statistics[] array by its type value.
function statVal(
  stats: Array<{ type?: { value?: string }; count?: number }> | undefined,
  typeValue: string
): number | null {
  if (!Array.isArray(stats)) return null;
  const hit = stats.find((s) => s?.type?.value === typeValue);
  return typeof hit?.count === "number" ? hit.count : null;
}

function normaliseLive(id: string, game: Record<string, unknown>): NormalisedLive {
  const result = (game.result ?? {}) as Record<string, unknown>;
  const clock = (game.clock ?? {}) as Record<string, unknown>;
  const sideStats = (side: string) =>
    (((result[side] ?? {}) as Record<string, unknown>).statistics ?? []) as Array<{
      type?: { value?: string };
      count?: number;
    }>;
  const home = sideStats("home");
  const away = sideStats("away");
  return {
    id,
    status: (game.status as string) ?? null,
    clock: {
      period: (clock.period as string) ?? null,
      time: (clock.time as string) ?? null,
      status: (clock.status as string) ?? null,
    },
    home: {
      total: statVal(home, "TOTAL_SCORE"),
      goals: statVal(home, "TOTAL_GOALS"),
      behinds: statVal(home, "TOTAL_BEHINDS"),
    },
    away: {
      total: statVal(away, "TOTAL_SCORE"),
      goals: statVal(away, "TOTAL_GOALS"),
      behinds: statVal(away, "TOTAL_BEHINDS"),
    },
  };
}

// Fetch one game from PlayHQ. Returns the `game` object, or throws a tagged
// error the handler maps to an HTTP status.
async function fetchGame(id: string, env: Env): Promise<unknown> {
  const upstream = await fetch(PLAYHQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://www.playhq.com",
      Accept: "*/*",
      "x-phq-tenant": env.PHQ_TENANT ?? "afl",
    },
    body: JSON.stringify({
      operationName: "game",
      variables: { id, scope: "BY_PERIOD" },
      query: GAME_QUERY,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  // Surface rate-limit / forbidden explicitly so the caller can back off.
  if (upstream.status === 429) throw new UpstreamError("rate_limited", 429);
  if (upstream.status === 403) throw new UpstreamError("forbidden", 403);
  if (!upstream.ok) throw new UpstreamError("upstream_error", 502);

  const data = (await upstream.json()) as {
    data?: { game?: unknown };
    errors?: unknown[];
  };
  if (data.errors?.length) throw new UpstreamError("graphql_errors", 502);
  if (!data.data?.game) throw new UpstreamError("not_found", 404);
  return data.data.game;
}

class UpstreamError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// A grade id is a UUID (e.g. "be950883-7630-4df5-81e4-a5bba0f24cb6").
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fetch ALL games for a grade from the official PlayHQ REST API, following the
// cursor pagination (metadata.hasMore / metadata.nextCursor) so a full season
// comes back in one response. Requires the secret API key.
async function fetchGradeGames(gradeId: string, env: Env): Promise<unknown[]> {
  if (!env.PHQ_API_KEY) throw new UpstreamError("api_key_not_configured", 500);

  const all: unknown[] = [];
  let cursor: string | null = null;
  // Safety cap on pages so a pagination bug can't loop forever.
  for (let page = 0; page < 50; page++) {
    const u = new URL(`${PLAYHQ_REST}/grades/${gradeId}/games`);
    if (cursor) u.searchParams.set("cursor", cursor);

    const upstream = await fetch(u.toString(), {
      method: "GET",
      headers: {
        "x-api-key": env.PHQ_API_KEY,
        "x-phq-tenant": env.PHQ_TENANT ?? "afl",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (upstream.status === 429) throw new UpstreamError("rate_limited", 429);
    if (upstream.status === 401 || upstream.status === 403)
      throw new UpstreamError("forbidden", upstream.status);
    if (upstream.status === 404) throw new UpstreamError("not_found", 404);
    if (!upstream.ok) throw new UpstreamError("upstream_error", 502);

    const body = (await upstream.json()) as {
      data?: unknown[];
      metadata?: { hasMore?: boolean; nextCursor?: string | null };
    };
    if (Array.isArray(body.data)) all.push(...body.data);
    if (!body.metadata?.hasMore || !body.metadata.nextCursor) break;
    cursor = body.metadata.nextCursor;
  }
  return all;
}

// A lean fixture record for the discovery endpoint: just what a consuming app
// needs to identify a fixture and then poll its score by `id`. Strips the
// heavy venue/address/sub-score detail from the full game object.
type FixtureLite = {
  id: string; // the PlayHQ fixture/game id — poll /api/fixtures/:id/live with it
  status: string | null;
  round: string | null;
  date: string | null; // yyyy-mm-dd
  time: string | null; // HH:mm:ss
  timezone: string | null;
  venue: string | null;
  home: string | null;
  away: string | null;
  url: string | null;
};

function toFixtureLite(game: Record<string, unknown>): FixtureLite {
  const round = (game.round ?? {}) as Record<string, unknown>;
  const schedule = (game.schedule ?? {}) as Record<string, unknown>;
  const venue = (game.venue ?? null) as Record<string, unknown> | null;
  const comps = Array.isArray(game.competitors)
    ? (game.competitors as Array<Record<string, unknown>>)
    : [];
  const home = comps.find((c) => c.isHomeTeam === true);
  const away = comps.find((c) => c.isHomeTeam === false);
  return {
    id: String(game.id ?? ""),
    status: (game.status as string) ?? null,
    round: (round.name as string) ?? null,
    date: (schedule.date as string) ?? null,
    time: (schedule.time as string) ?? null,
    timezone: (schedule.timezone as string) ?? null,
    venue: (venue?.name as string) ?? null,
    home: (home?.name as string) ?? null,
    away: (away?.name as string) ?? null,
    url: (game.url as string) ?? null,
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(env, origin);

    // CORS preflight.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405, cors);
    }

    if (url.pathname === "/health") {
      return json({ ok: true }, 200, cors);
    }

    const ttl = Math.max(0, Number(env.CACHE_TTL_SECONDS ?? "90") || 90);
    const cache = caches.default;

    // /api/grades/:id/fixtures — LEAN fixture index for a grade. Returns just
    // the fixture id + identifying detail (teams, round, date, status) so a
    // consuming application can discover the PlayHQ fixture id and then poll
    // its score via /api/fixtures/:id/live. This is the discovery endpoint for
    // external software.
    const fixturesMatch = url.pathname.match(
      /^\/api\/grades\/([^/]+)\/fixtures$/
    );
    if (fixturesMatch) {
      const gradeId = decodeURIComponent(fixturesMatch[1]);
      if (!UUID_RE.test(gradeId)) {
        return json({ error: "invalid_grade_id" }, 400, cors);
      }
      const key = new Request(`https://playhq-cache/grade-fixtures/${gradeId}`);
      const hit = await cache.match(key);
      if (hit) {
        return new Response(await hit.text(), {
          status: 200,
          headers: { "Content-Type": "application/json", "X-Cache": "HIT", ...cors },
        });
      }
      try {
        const games = await fetchGradeGames(gradeId, env);
        const fixtures = (games as Array<Record<string, unknown>>).map(
          toFixtureLite
        );
        const bodyText = JSON.stringify({
          gradeId,
          count: fixtures.length,
          fixtures,
        });
        const listTtl = Math.min(ttl, 60) || 60;
        ctx.waitUntil(
          cache.put(
            key,
            new Response(bodyText, {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": `public, max-age=${listTtl}`,
              },
            })
          )
        );
        return new Response(bodyText, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Cache": "MISS",
            "Cache-Control": `public, max-age=${listTtl}`,
            ...cors,
          },
        });
      } catch (err) {
        if (err instanceof UpstreamError) {
          const extra: HeadersInit =
            err.status === 429 ? { "Retry-After": "120", ...cors } : cors;
          return json({ error: err.message }, err.status, extra);
        }
        return json({ error: "unable_to_retrieve_fixtures" }, 502, cors);
      }
    }

    // /api/grades/:id/games — the full fixture list for a grade (official REST
    // API). Cached at the edge like the live scores so repeated dashboard opens
    // don't re-hit PlayHQ. The fixture list changes slowly, so give it a longer
    // TTL than live scores.
    const gradeMatch = url.pathname.match(/^\/api\/grades\/([^/]+)\/games$/);
    if (gradeMatch) {
      const gradeId = decodeURIComponent(gradeMatch[1]);
      if (!UUID_RE.test(gradeId)) {
        return json({ error: "invalid_grade_id" }, 400, cors);
      }
      const gradeKey = new Request(`https://playhq-cache/grade-games/${gradeId}`);
      const gradeCached = await cache.match(gradeKey);
      if (gradeCached) {
        return new Response(await gradeCached.text(), {
          status: 200,
          headers: { "Content-Type": "application/json", "X-Cache": "HIT", ...cors },
        });
      }
      try {
        const games = await fetchGradeGames(gradeId, env);
        const bodyText = JSON.stringify({ gradeId, count: games.length, data: games });
        // Fixture list is slow-moving — cache a bit longer (but still short so
        // in-progress scores on the list refresh). 60s.
        const listTtl = Math.min(ttl, 60) || 60;
        const toCache = new Response(bodyText, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${listTtl}`,
          },
        });
        ctx.waitUntil(cache.put(gradeKey, toCache));
        return new Response(bodyText, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Cache": "MISS",
            "Cache-Control": `public, max-age=${listTtl}`,
            ...cors,
          },
        });
      } catch (err) {
        if (err instanceof UpstreamError) {
          const extra: HeadersInit =
            err.status === 429 ? { "Retry-After": "120", ...cors } : cors;
          return json({ error: err.message }, err.status, extra);
        }
        return json({ error: "unable_to_retrieve_games" }, 502, cors);
      }
    }

    // /api/fixtures/:id/live-scores  (raw spectator payload)
    // /api/fixtures/:id/live         (compact normalised live score)
    // /api/fixtures/:id/status       (just id/status/updatedAt)
    const m = url.pathname.match(
      /^\/api\/fixtures\/([^/]+)\/(live-scores|live|status)$/
    );
    if (!m) return json({ error: "not_found" }, 404, cors);

    const id = decodeURIComponent(m[1]);
    const kind = m[2];
    if (!ID_RE.test(id)) {
      return json({ error: "invalid_fixture_id" }, 400, cors);
    }

    // Edge cache keyed by the normalised request (one entry per fixture+kind).
    // Many dashboard tabs polling the same fixture within the TTL collapse to a
    // single upstream call.
    const cacheKey = new Request(
      `https://playhq-cache/${kind}/${id}`,
      { method: "GET" }
    );
    const cached = await cache.match(cacheKey);
    if (cached) {
      const body = await cached.text();
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "HIT",
          ...cors,
        },
      });
    }

    try {
      const game = (await fetchGame(id, env)) as Record<string, unknown>;
      const payload =
        kind === "status"
          ? {
              id: game.id,
              status: game.status,
              updatedAt: game.updatedAt,
            }
          : kind === "live"
            ? normaliseLive(id, game)
            : game;

      const bodyText = JSON.stringify(payload);

      // Store in the edge cache with the configured TTL (only when TTL > 0).
      if (ttl > 0) {
        const toCache = new Response(bodyText, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${ttl}`,
          },
        });
        ctx.waitUntil(cache.put(cacheKey, toCache));
      }

      return new Response(bodyText, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "MISS",
          // Tell the browser not to cache a live score beyond the edge TTL.
          "Cache-Control": `public, max-age=${ttl}`,
          ...cors,
        },
      });
    } catch (err) {
      if (err instanceof UpstreamError) {
        // Pass rate-limit / forbidden through so the poller can back off, and
        // hint a Retry-After on 429.
        const extra: HeadersInit =
          err.status === 429 ? { "Retry-After": "120", ...cors } : cors;
        return json({ error: err.message }, err.status, extra);
      }
      // Timeouts / network faults.
      return json({ error: "unable_to_retrieve_scores" }, 502, cors);
    }
  },
};
