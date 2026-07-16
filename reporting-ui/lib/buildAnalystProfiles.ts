export function buildAnalystProfiles(shifts: any[], games: any[]) {
  const map: Record<string, any> = {};

  // -------------------------
  // SAFE STRING NORMALISER
  // -------------------------
  const norm = (str: string) =>
    (str || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");

  // -------------------------
  // GET OR CREATE ANALYST
  // -------------------------
  const getOrCreate = (name: string) => {
    const key = norm(name);

    if (!map[key]) {
      map[key] = {
        name,
        kpis: {
          hours: 0,
          cost: 0,
          games: 0,
        },
        areas: {},
        competitions: {},
        teams: {},
      };
    }

    return map[key];
  };

  // -------------------------
  // SHIFTS → HOURS + COST + AREAS
  // -------------------------
  (shifts || []).forEach((s) => {
    const name = s.employee_name;
    if (!name) return;

    const analyst = getOrCreate(name);

    const hours = Number(s.total_hours) || 0;
    const cost = Number(s.total_cost) || 0;

    const area = s.area_name || "";

    const validHourAreas = [
      "Home Analyst",
      "Office Analyst",
    ];

    const isValidHours = validHourAreas.includes(area);

    // only count valid working hours
    if (isValidHours) {
      analyst.kpis.hours += hours;
    }

    // cost always included
    analyst.kpis.cost += cost;

    // area breakdown
    analyst.areas[area] =
      (analyst.areas[area] || 0) + hours;
  });

  // -------------------------
  // GAMES → GAME COUNT + COMPETITIONS + TEAMS
  // -------------------------
  (games || []).forEach((g) => {
    const home = g.home_allocated;
    const away = g.away_allocated;
    const comp = g.Competition || "Unknown";

    const processGame = (name: string) => {
      if (!name) return;

      const isMatch =
        norm(home) === norm(name) ||
        norm(away) === norm(name);

      if (!isMatch) return;

      const analyst = getOrCreate(name);

      // GAME COUNT (each appearance = +1)
      analyst.kpis.games += 1;

      // COMPETITION BREAKDOWN
      analyst.competitions[comp] =
        (analyst.competitions[comp] || 0) + 1;

      // TEAM BREAKDOWN
      if (g.home_team) {
        analyst.teams[g.home_team] =
          (analyst.teams[g.home_team] || 0) + 1;
      }

      if (g.away_team) {
        analyst.teams[g.away_team] =
          (analyst.teams[g.away_team] || 0) + 1;
      }
    };

    processGame(home);
    processGame(away);
  });

  // -------------------------
  // FINAL TRANSFORM (DERIVED METRICS)
  // -------------------------
 return Object.values(map).map((a: any) => {
  const hours = Number(a.kpis.hours ?? 0);
  const cost = Number(a.kpis.cost ?? 0);
  const games = Number(a.kpis.games ?? 0);

  return {
    ...a,

    // -------------------------
    // GUARANTEED KPI SOURCE
    // -------------------------
    avgHoursPerGame: games ? hours / games : 0,
    avgCostPerGame: games ? cost / games : 0,
  };
});
}