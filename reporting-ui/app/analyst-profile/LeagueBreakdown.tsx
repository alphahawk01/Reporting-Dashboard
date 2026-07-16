import Card from "@/components/UI/Card";
import { leagueLogos } from "./leagueLogos";

type Props = {
  data?: Record<string, number>;
};

export default function LeagueBreakdown({ data = {} }: Props) {
  const leagues = Object.entries(data).sort(([, a], [, b]) => b - a);

  const max = Math.max(...leagues.map(([, value]) => value), 1);

  return (
    <Card>
      <h2 className="text-white text-center font-semibold mb-4">
        Leagues Analysed
      </h2>

      <div className="max-h-[320px] overflow-y-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm bg-white">

          {/* HEADER */}
          <thead className="sticky top-0 bg-gray-100 z-10">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-bold">
                League
              </th>

              <th className="text-center px-4 py-3 text-gray-600 w-24 font-bold">
                Games
              </th>

              <th className="text-left px-4 py-3 text-gray-600 font-bold">
                Activity
              </th>
            </tr>
          </thead>

          {/* BODY */}
          <tbody className="bg-white">

            {leagues.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center p-6 text-gray-500">
                  No data available
                </td>
              </tr>
            ) : (
              leagues.map(([league, games]) => {
                const percent = (games / max) * 100;

                return (
                  <tr
                    key={league}
                    className="border-t border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    {/* LEAGUE */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 flex items-center justify-center">
                          <img
                            src={
                              leagueLogos[league] ??
                              "/leagues/default.png"
                            }
                            alt={league}
                            className="w-15 h-15 object-contain"
                          />
                        </div>

                        <span className="text-gray-800 font-bold">
                          {league}
                        </span>
                      </div>
                    </td>

                    {/* GAMES */}
                    <td className="text-center font-semibold text-blue-600">
                      {games}
                    </td>

                    {/* ACTIVITY BAR */}
                    <td className="px-4 py-3">
                      <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400"
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