"use client";

import Card from "@/components/UI/Card";
import type { TeamMetric } from "@/types/analyst";

type Props = {
  data?: Record<string, TeamMetric>;
};

export default function TeamBreakdown({ data = {} }: Props) {
  const teams = Object.entries(data).sort(
    ([, a], [, b]) => b.count - a.count
  );

  const max = Math.max(...teams.map(([, v]) => v.count), 1);

  return (
    <Card>
      <h2 className="text-white text-center font-semibold mb-4">
        Teams Analysed
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
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-800">
                          {team}
                        </span>

                        <span className="text-[11px] leading-4 text-slate-500">
                          {value.league}
                        </span>
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