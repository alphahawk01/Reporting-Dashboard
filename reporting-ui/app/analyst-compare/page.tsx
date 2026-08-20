"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
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
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from "@/components/UI/tabs";

type ShiftRow = any;
type TTGameRow = any;

const PAGE_SIZE = 1000;

async function fetchAll<T>(table: string): Promise<T[]> {
    let from = 0;
    let all: T[] = [];

    while (true) {

        const { data, error } = await supabase
            .from(table)
            .select("*")
            .range(from, from + PAGE_SIZE - 1);

        if (error) {
            console.error(`Error fetching ${table}:`, error);
            break;
        }

        if (!data || data.length === 0) break;

        all = all.concat(data as T[]);

        if (data.length < PAGE_SIZE) break;

        from += PAGE_SIZE;
    }

    return all;
}

export default function AnalystComparePage() {

    const [loading, setLoading] = useState(true);

    const [shiftRows, setShiftRows] = useState<ShiftRow[]>([]);
    const [ttRows, setTTRows] = useState<TTGameRow[]>([]);

    const [analystA, setAnalystA] = useState("");
    const [analystB, setAnalystB] = useState("");

    useEffect(() => {

        async function load() {

            setLoading(true);

            const [shifts, tt] = await Promise.all([
                fetchAll<ShiftRow>("deputy_shifts"),
                fetchAll<TTGameRow>("TT_Games"),
            ]);

            setShiftRows(shifts);
            setTTRows(tt);

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

    function swapAnalysts() {
        const a = analystA;
        const b = analystB;
        setAnalystA(b);
        setAnalystB(a);
    }

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

                <datalist id="analyst-options">
                    {analysts.map(name => (
                        <option key={name} value={name} />
                    ))}
                </datalist>

                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4 mb-10">

                    <div>

                        <label className="block mb-2 text-sm text-slate-400">
                            Analyst A
                        </label>

                        <input
                            type="text"
                            list="analyst-options"
                            value={analystA}
                            onChange={(e) => setAnalystA(e.target.value)}
                            placeholder="Search analyst..."
                            className="
                                w-full
                                rounded-lg
                                bg-slate-900
                                border
                                border-slate-700
                                px-4
                                py-3
                                text-white
                                placeholder:text-slate-500
                                focus:outline-none
                                focus:border-sky-500
                            "
                        />

                    </div>

                    <button
                        type="button"
                        onClick={swapAnalysts}
                        title="Swap analysts"
                        className="
                            mb-0.5
                            flex
                            h-11
                            w-11
                            items-center
                            justify-center
                            rounded-full
                            border
                            border-slate-700
                            bg-slate-900
                            text-slate-300
                            transition-colors
                            hover:border-sky-500
                            hover:text-sky-400
                        "
                    >
                        ⇄
                    </button>

                    <div>

                        <label className="block mb-2 text-sm text-slate-400">
                            Analyst B
                        </label>

                        <input
                            type="text"
                            list="analyst-options"
                            value={analystB}
                            onChange={(e) => setAnalystB(e.target.value)}
                            placeholder="Search analyst..."
                            className="
                                w-full
                                rounded-lg
                                bg-slate-900
                                border
                                border-slate-700
                                px-4
                                py-3
                                text-white
                                placeholder:text-slate-500
                                focus:outline-none
                                focus:border-sky-500
                            "
                        />

                    </div>

                </div>

                <div className="grid grid-cols-1 gap-4 mb-10">

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

                {analystDataA && analystDataB ? (

                    <Tabs defaultValue="overview">

                        <TabsList className="flex gap-2 border-b border-slate-800 mb-8 overflow-x-auto">
                            {[
                                ["overview", "Overview"],
                                ["attributes", "Attributes"],
                                ["kpis", "KPIs"],
                                ["trends", "Trends"],
                                ["rankings", "Rankings"],
                                ["gaps", "Gaps"],
                            ].map(([value, label]) => (
                                <TabsTrigger
                                    key={value}
                                    value={value}
                                    activeClassName="px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition border-sky-500 text-sky-400"
                                    inactiveClassName="px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition border-transparent text-slate-400 hover:text-slate-200"
                                >
                                    {label}
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        <TabsContent value="overview">
                            <div className="space-y-8">

                                <ComparisonSummary
                                    analystA={analystDataA}
                                    analystB={analystDataB}
                                />

                                <ComparisonRadar
                                    analystA={analystDataA}
                                    analystB={analystDataB}
                                />

                            </div>
                        </TabsContent>

                        <TabsContent value="attributes">
                            <div className="space-y-8">

                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

                                    <AttributeRatings
                                        ratings={analystDataA.ratings}
                                    />

                                    <AttributeRatings
                                        ratings={analystDataB.ratings}
                                    />

                                </div>

                                <ComparisonAttributes
                                    analystA={analystDataA}
                                    analystB={analystDataB}
                                />

                            </div>
                        </TabsContent>

                        <TabsContent value="kpis">
                            <ComparisonKPIs
                                analystA={analystDataA}
                                analystB={analystDataB}
                            />
                        </TabsContent>

                        <TabsContent value="trends">
                            <ComparisonTrendCharts
                                analystA={analystDataA.name}
                                analystB={analystDataB.name}
                                shifts={shiftRows}
                                games={ttRows}
                            />
                        </TabsContent>

                        <TabsContent value="rankings">
                            <ComparisonRanking
                                analysts={benchmark}
                                analystA={analystDataA}
                                analystB={analystDataB}
                            />
                        </TabsContent>

                        <TabsContent value="gaps">
                            <ComparisonGaps
                                analystA={analystDataA}
                                analystB={analystDataB}
                            />
                        </TabsContent>

                    </Tabs>

                ) : (

                    <div className="rounded-xl border border-slate-700 bg-[#0f172a] p-8 text-center text-slate-400">
                        Select two analysts to compare.
                    </div>

                )}

            </div>

        </main>

    );

}
