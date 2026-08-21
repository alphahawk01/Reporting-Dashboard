"use client";

import Card from "@/components/UI/Card";
import type { AnalystMetrics } from "@/types/analyst";

type Props = {
  data: AnalystMetrics;
};

const ATTRIBUTE_LABELS: Record<string, string> = {
  speed: "⚡ Speed",
  efficiency: "💰 Efficiency",
  workRate: "🏃 Work Rate",
  experience: "🎯 Experience",
  consistency: "📅 Consistency",
  versatility: "🌍 Versatility",
  knowledge: "🧠 Knowledge",
};

/**
 * Builds a plain-English sentence explaining what a rating actually
 * means, using the real underlying metric (hours/game, cost/game,
 * games/week, etc.) rather than just the attribute name and score —
 * so it's meaningful to someone with no context on the rating system.
 */
function describeAttribute(
  key: string,
  data: AnalystMetrics
): string {
  const leagueCount = Object.keys(data.competitions ?? {}).length;
  const teamCount = Object.keys(data.teams ?? {}).length;

  switch (key) {
    case "speed":
      return `Codes a game in an average of ${data.avgHoursPerGame.toFixed(1)} hours, making them one of the faster turnaround analysts.`;
    case "efficiency":
      return `Costs an average of $${data.avgCostPerGame.toFixed(0)} per game coded, keeping delivery cost low relative to peers.`;
    case "workRate":
      return `Puts in an average of ${data.avgHoursPerWeek.toFixed(1)} hours of coding work per week.`;
    case "experience":
      return `Has coded ${data.totalGames} games in total, reflecting a strong depth of experience.`;
    case "consistency":
      return `Completes an average of ${data.avgGamesPerWeek.toFixed(1)} games per week, showing a steady, reliable output.`;
    case "versatility":
      return `Has analysed ${leagueCount} different competition${leagueCount === 1 ? "" : "s"}, showing broad coverage across leagues.`;
    case "knowledge":
      return `Has analysed ${teamCount} different team${teamCount === 1 ? "" : "s"}, reflecting deep familiarity with a wide range of clubs.`;
    default:
      return "";
  }
}

export default function ExecutiveSummary({ data }: Props) {

  // -------------------------
  // TOP STRENGTHS (highest rated attributes)
  // -------------------------
  const strengths = Object.entries(data.ratings)
    .filter(([key]) => key !== "overall")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, value]) => ({
      key,
      label: ATTRIBUTE_LABELS[key] ?? key,
      value,
      sentence: describeAttribute(key, data),
    }));

  // -------------------------
  // TOP LEAGUES / TEAMS
  // -------------------------
  const topLeagues = Object.entries(data.competitions ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topTeams = Object.entries(data.teams ?? {})
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  const leagueCount = Object.keys(data.competitions ?? {}).length;
  const teamCount = Object.keys(data.teams ?? {}).length;

  const strengthNames = strengths
    .map((s) => s.label.replace(/^[^\s]+\s/, "").toLowerCase())
    .join(", ");

  const topLeagueName = topLeagues[0]?.[0];
  const topTeamName = topTeams[0]?.[0];

  const topStrengthSentence = strengths[0]?.sentence ?? "";

  return (
    <Card>
      <div className="p-5">

        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Executive Summary
        </h2>

        <p className="mb-4 text-sm leading-6 text-slate-300">
          {data.name} is rated{" "}
          <span className="font-semibold text-white">{data.grade}</span>{" "}
          overall — ranked #{data.rank} of {data.totalAnalysts} in{" "}
          {data.team} (top {data.percentile}%). Their strongest areas are{" "}
          {strengthNames}. {topStrengthSentence} Across {data.totalGames}{" "}
          games coded, {data.name} has covered {leagueCount} competition
          {leagueCount === 1 ? "" : "s"}
          {topLeagueName ? `, most frequently ${topLeagueName}` : ""}, and
          analysed {teamCount} team{teamCount === 1 ? "" : "s"}
          {topTeamName ? `, including ${topTeamName}` : ""}.
        </p>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">

          {/* KEY STRENGTHS */}
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Key Strengths
            </h3>

            <div className="space-y-1">
              {strengths.map((s) => (
                <div
                  key={s.key}
                  className="group relative flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-slate-900"
                >
                  <span className="truncate text-xs text-slate-300">
                    {s.label}
                  </span>

                  <span className="flex-shrink-0 text-xs font-bold text-sky-400">
                    {s.value}
                  </span>

                  {/* HOVER TOOLTIP — matches AttributeRatings pattern */}
                  <div
                    className="
                      absolute
                      left-0
                      top-full
                      z-50
                      mt-1
                      w-64
                      rounded-lg
                      border
                      border-slate-700
                      bg-[#0b1220]
                      px-3
                      py-2
                      text-xs
                      leading-5
                      text-slate-300
                      opacity-0
                      invisible
                      shadow-2xl
                      transition-all
                      duration-150
                      pointer-events-none
                      group-hover:visible
                      group-hover:opacity-100
                    "
                  >
                    {s.sentence}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TOP LEAGUES */}
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Top Leagues
            </h3>

            <div className="space-y-1">
              {topLeagues.length ? (
                topLeagues.map(([league, games]) => (
                  <div
                    key={league}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-slate-900"
                  >
                    <span className="truncate text-xs text-slate-300">
                      {league}
                    </span>
                    <span className="flex-shrink-0 text-xs font-bold text-emerald-400">
                      {games}
                    </span>
                  </div>
                ))
              ) : (
                <div className="px-2 text-xs text-slate-500">
                  No league data.
                </div>
              )}
            </div>
          </div>

          {/* TOP TEAMS */}
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Top Teams
            </h3>

            <div className="space-y-1">
              {topTeams.length ? (
                topTeams.map(([team, value]) => (
                  <div
                    key={team}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-slate-900"
                  >
                    <span className="truncate text-xs text-slate-300">
                      {team}
                    </span>
                    <span className="flex-shrink-0 text-xs font-bold text-emerald-400">
                      {value.count}
                    </span>
                  </div>
                ))
              ) : (
                <div className="px-2 text-xs text-slate-500">
                  No team data.
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </Card>
  );
}
