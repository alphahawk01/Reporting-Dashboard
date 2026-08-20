"use client";

import Card from "@/components/UI/Card";
import type { TeamMetric } from "@/types/analyst";
import { clubLogos } from "./clubLogos";

type Props = {
  data?: Record<string, TeamMetric>;
  logoMap?: Record<string, string>;
};

/**
 * Resolves a club logo URL by trying:
 * 1. Supabase logo_url (passed via logoMap prop, keyed by lowercase team name)
 * 2. Static clubLogos mapping (case-insensitive)
 * 3. Suffix match — "Strathmore U18s" matches "strathmore" but
 *    "East Ringwood" won't match "ringwood" and "Doncaster East" won't match "doncaster"
 * 4. Returns null if no logo found
 */
const teamSuffixes = [
  " reserves",
  " u18s",
  " u18.5",
  " u19s",
  " u16s",
  " u15s",
  " u14s",
  " thirds",
  " seconds",
  " womens",
  " women",
];

function getClubLogo(
  team: string,
  logoMap: Record<string, string>
): string | null {
  const key = team.trim().toLowerCase();

  // Supabase logo_url — exact match
  if (logoMap[key]) return logoMap[key];

  // Static mapping — exact match
  if (clubLogos[key]) return clubLogos[key];

  // Suffix-aware match: strip known suffixes and try again
  // e.g. "strathmore u18s" → "strathmore", "aberfeldie reserves" → "aberfeldie"
  for (const suffix of teamSuffixes) {
    if (key.endsWith(suffix)) {
      const base = key.slice(0, -suffix.length);
      if (logoMap[base]) return logoMap[base];
      if (clubLogos[base]) return clubLogos[base];
    }
  }

  return null;
}

export default function TeamBreakdown({ data = {}, logoMap = {} }: Props) {
  const teams = Object.entries(data).sort(
    ([, a], [, b]) => b.count - a.count
  );

  const max = Math.max(...teams.map(([, v]) => v.count), 1);

  return (
    <Card>
      <h2 className="mb-4 flex items-center justify-center gap-2 text-center font-semibold text-white">
        Teams Analysed
        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-bold text-sky-300">
          {teams.length}
        </span>
      </h2>

      <div className="max-h-[320px] overflow-y-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm bg-white">
          {/* HEADER */}
          <thead className="sticky top-0 bg-gray-100 z-10">
            <tr>
              <th className="px-4 py-2 text-left font-bold text-gray-600">
                Team
              </th>

              <th className="w-24 px-4 py-2 text-center font-bold text-gray-600">
                Games
              </th>

              <th className="px-4 py-2 text-left font-bold text-gray-600">
                Activity
              </th>
            </tr>
          </thead>

          {/* BODY */}
          <tbody className="bg-white">
            {teams.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="p-6 text-center text-gray-500"
                >
                  No data available
                </td>
              </tr>
            ) : (
              teams.map(([team, value]) => {
                const percent = (value.count / max) * 100;

                return (
                  <tr
                    key={team}
                    className="border-t border-gray-200 transition-colors hover:bg-gray-50"
                  >
                    {/* TEAM */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                          {(() => {
                            const logo = getClubLogo(team, logoMap);
                            if (!logo) return null;
                            return (
                              <img
                                src={logo}
                                alt={team}
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            );
                          })()}
                        </div>

                        <div className="flex flex-col">
                          <span className="font-bold text-gray-800">
                            {team}
                          </span>

                          <span className="text-[11px] leading-4 text-slate-500">
                            {value.league}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* GAMES */}
                    <td className="text-center font-semibold text-sky-600">
                      {value.count}
                    </td>

                    {/* ACTIVITY */}
                    <td className="px-4 py-3">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}