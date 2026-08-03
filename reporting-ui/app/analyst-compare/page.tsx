"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

import AnalystHero from "../analyst-profile/AnalystHero";
import AttributeRatings from "../analyst-profile/AttributeRatings";
import ComparisonRadar from "./ComparisonRadar";
import { buildAnalystMetrics } from "@/lib/analytics/buildAnalystMetrics";
import { buildAnalystBenchmark } from "@/lib/analytics/buildAnalystBenchmark";
import ComparisonSummary from "./ComparisonSummary";
import ComparisonKPIs from "./ComparisonKPIs";
import ComparisonTrendCharts from "./ComparisonTrendCharts";
import ComparisonAttributes from "./ComparisonAttributes";
import ComparisonRanking from "./ComparisonRanking";
import ComparisonGaps from "./ComparisonGaps";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ShiftRow = any;
type TTGameRow = any;

export default function AnalystComparePage() {

    const [loading, setLoading] = useState(true);

    const [shiftRows, setShiftRows] = useState<ShiftRow[]>([]);
    const [ttRows, setTTRows] = useState<TTGameRow[]>([]);

    const [analystA, setAnalystA] = useState("");
    const [analystB, setAnalystB] = useState("");

    useEffect(() => {

        async function load() {

            setLoading(true);

            const shifts = await supabase
                .from("deputy_shifts")
                .select("*");

            const tt = await supabase
                .from("TT_Games")
                .select("*");

            setShiftRows(shifts.data ?? []);
            setTTRows(tt.data ?? []);

            setLoading(false);
        }

        load();

    }, []);

    const benchmark = useMemo(() => {

        if (!shiftRows.length) return [];

        return buildAnalystBenchmark(
            buildAnalystMetrics(
                shiftRows,
                ttRows
            )
        );

    }, [shiftRows, ttRows]);

    const analysts = useMemo(() => {

        return benchmark
            .map((a: any) => a.name)
            .sort();

    }, [benchmark]);

    useEffect(() => {

        if (!analystA && analysts.length) {
            setAnalystA(analysts[0]);
        }

        if (!analystB && analysts.length > 1) {
            setAnalystB(analysts[1]);
        }

    }, [analysts]);

    const analystDataA = useMemo(() => {

        return benchmark.find(
            (x: any) => x.name === analystA
        );

    }, [benchmark, analystA]);

    const analystDataB = useMemo(() => {

        return benchmark.find(
            (x: any) => x.name === analystB
        );

    }, [benchmark, analystB]);

    if (loading) {

        return (

            <div className="min-h-screen bg-[#081220] flex items-center justify-center text-white">

                Loading comparison...

            </div>

        );

    }

    return (

        <main className="min-h-screen bg-[#081220] text-white">

            <div className="max-w-7xl mx-auto p-8">

                <div className="flex items-center justify-between mb-8">

                    <div>

                        <h1 className="text-4xl font-bold">
                            Analyst Comparison
                        </h1>

                        <p className="text-slate-400 mt-2">
                            Compare two analysts across every KPI.
                        </p>

                    </div>

                    <Link
                        href="/analyst-profile"
                        className="
                            rounded-lg
                            border
                            border-slate-700
                            px-4
                            py-2
                            hover:bg-slate-800
                        "
                    >
                        Back
                    </Link>

                </div>

                <div className="grid grid-cols-2 gap-8 mb-10">

                    <div>

                        <label className="block mb-2 text-sm text-slate-400">
                            Analyst A
                        </label>

                        <select
                            value={analystA}
                            onChange={(e) => setAnalystA(e.target.value)}
                            className="
                                w-full
                                rounded-lg
                                bg-slate-900
                                border
                                border-slate-700
                                px-4
                                py-3
                            "
                        >
                            {analysts.map(name => (
                                <option
                                    key={name}
                                    value={name}
                                >
                                    {name}
                                </option>
                            ))}
                        </select>

                    </div>

                    <div>

                        <label className="block mb-2 text-sm text-slate-400">
                            Analyst B
                        </label>

                        <select
                            value={analystB}
                            onChange={(e) => setAnalystB(e.target.value)}
                            className="
                                w-full
                                rounded-lg
                                bg-slate-900
                                border
                                border-slate-700
                                px-4
                                py-3
                            "
                        >
                            {analysts.map(name => (
                                <option
                                    key={name}
                                    value={name}
                                >
                                    {name}
                                </option>
                            ))}
                        </select>

                    </div>

                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-10">

                    <div>

                        {analystDataA ? (
                            <AnalystHero
                                data={analystDataA}
                            />
                        ) : (
                            <div className="rounded-xl border border-slate-700 bg-[#0f172a] p-8 text-center text-slate-400">
                                Select an analyst.
                            </div>
                        )}

                    </div>

                    <div>

                        {analystDataB ? (
                            <AnalystHero
                                data={analystDataB}
                            />
                        ) : (
                            <div className="rounded-xl border border-slate-700 bg-[#0f172a] p-8 text-center text-slate-400">
                                Select an analyst.
                            </div>
                        )}

                    </div>

                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-10">

                    <div>

                        {analystDataA && (

                            <AttributeRatings
                                ratings={analystDataA.ratings}
                            />

                        )}

                    </div>

                    <div>

                        {analystDataB && (

                            <AttributeRatings
                                ratings={analystDataB.ratings}
                            />

                        )}

                    </div>

                </div>

                <div className="mb-10">
                    <ComparisonRadar
                        analystA={analystDataA}
                        analystB={analystDataB}
                    />
                </div>

                {analystDataA && analystDataB && (
                    <div className="mb-10">
                        <ComparisonSummary
                            analystA={analystDataA}
                            analystB={analystDataB}
                        />
                    </div>
                )}

                {analystDataA && analystDataB && (
                    <div className="mb-10">
                        <ComparisonKPIs
                            analystA={analystDataA}
                            analystB={analystDataB}
                        />
                    </div>
                )}

                {analystDataA && analystDataB && (
                    <div className="mb-10">
                        <ComparisonAttributes
                            analystA={analystDataA}
                            analystB={analystDataB}
                        />
                    </div>
                )}

                {analystDataA && analystDataB && (
                    <div className="mb-10">
                        <ComparisonRanking
                            analysts={benchmark}
                            analystA={analystDataA}
                            analystB={analystDataB}
                        />
                    </div>
                )}

                {analystDataA && analystDataB && (
                    <div className="mb-10">
                        <ComparisonGaps
                            analystA={analystDataA}
                            analystB={analystDataB}
                        />
                    </div>
                )}
            </div>

        </main>

    );

}