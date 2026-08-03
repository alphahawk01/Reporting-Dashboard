"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

import { buildAnalystMetrics } from "@/lib/analytics/buildAnalystMetrics";
import { recommendFixture } from "@/lib/recommendations/recommendationEngine";

import type { DeputyShift } from "@/types/deputy";
import type { TTGame } from "@/types/ttgame";

export default function RecommendationPage() {
    const [results, setResults] = useState<any[]>([]);

    useEffect(() => {

        async function load() {

            const { data: shifts } =
                await supabase
                    .from("deputy_shifts")
                    .select("*");

            const { data: games } =
                await supabase
                    .from("TT_Games")
                    .select("*");

            if (!shifts || !games) return;

            const analysts =
                buildAnalystMetrics(
                    shifts as DeputyShift[],
                    games as TTGame[]
                );

            // Pick any fixture for now
            const fixture = games[0];

            const ranked =
                recommendFixture(
                    fixture,
                    analysts
                );

            console.log(ranked);

            setResults(ranked);

        }

        load();

    }, []);

    return (

        <div className="p-8">

            <h1 className="text-3xl font-bold mb-6">
                Recommendation Test
            </h1>

            <table className="min-w-full">

                <thead>

                    <tr>

                        <th>Analyst</th>

                        <th>League</th>

                        <th>Teams</th>

                    </tr>

                </thead>

                <tbody>

                    {results.map(r => (

                        <tr key={r.analyst.key}>

                            <td>{r.analyst.name}</td>

                            <td>{r.leagueScore}</td>

                            <td>{r.teamScore}</td>

                        </tr>

                    ))}

                </tbody>

            </table>

        </div>

    );

}