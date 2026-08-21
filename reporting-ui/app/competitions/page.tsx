"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { THEME } from "@/lib/theme";
import { isExcludedAnalystName } from "@/lib/analytics/excludedAnalysts";
import {
    getAnalystImage,
    getAnalystInitials,
} from "@/app/analyst-profile/analystImages";
import type { TTGame } from "@/types/ttgame";

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

type AnalystTally = {
    name: string;
    games: number;
};

type TeamCoder = {
    team: string;
    totalGames: number;
    topAnalyst: string | null;
    topGames: number;
};

export default function CompetitionsPage() {

    const [loading, setLoading] = useState(true);
    const [games, setGames] = useState<TTGame[]>([]);
    const [selectedCompetition, setSelectedCompetition] = useState("");

    useEffect(() => {

        async function load() {

            setLoading(true);

            const data = await fetchAll<TTGame>("TT_Games");

            setGames(data);
            setLoading(false);
        }

        load();

    }, []);

    // -------------------------
    // COMPETITION LIST
    // -------------------------
    const competitions = useMemo(() => {

        const unique = new Set<string>();

        games.forEach((g) => {
            if (g.Competition) unique.add(g.Competition);
        });

        return [...unique].sort((a, b) => a.localeCompare(b));

    }, [games]);

    useEffect(() => {

        if (!selectedCompetition && competitions.length) {
            setSelectedCompetition(competitions[0]);
        }

    }, [competitions, selectedCompetition]);

    // -------------------------
    // FIXTURES FOR SELECTED COMPETITION
    // -------------------------
    const fixtures = useMemo(() => {

        return games
            .filter((g) => g.Competition === selectedCompetition)
            .sort((a, b) => {
                const weekA = Number(a.Week) || 0;
                const weekB = Number(b.Week) || 0;

                if (weekA !== weekB) return weekA - weekB;

                return Number(a.Round || 0) - Number(b.Round || 0);
            });

    }, [games, selectedCompetition]);

    // -------------------------
    // TOP ANALYSTS FOR COMPETITION
    // -------------------------
    const topAnalysts = useMemo(() => {

        const tally = new Map<string, number>();

        fixtures.forEach((game) => {

            if (
                game.home_allocated &&
                !isExcludedAnalystName(game.home_allocated)
            ) {
                tally.set(
                    game.home_allocated,
                    (tally.get(game.home_allocated) ?? 0) + 0.5
                );
            }

            if (
                game.away_allocated &&
                !isExcludedAnalystName(game.away_allocated)
            ) {
                tally.set(
                    game.away_allocated,
                    (tally.get(game.away_allocated) ?? 0) + 0.5
                );
            }

        });

        const result: AnalystTally[] = [...tally.entries()]
            .map(([name, gamesCoded]) => ({ name, games: gamesCoded }))
            .sort((a, b) => b.games - a.games)
            .slice(0, 5);

        return result;

    }, [fixtures]);

    // -------------------------
    // TOP CODER PER TEAM
    // -------------------------
    const teamCoders = useMemo(() => {

        const perTeam = new Map<string, Map<string, number>>();
        const totalGamesPerTeam = new Map<string, number>();

        function addTeamAppearance(
            team: string,
            analyst: string | null
        ) {

            totalGamesPerTeam.set(
                team,
                (totalGamesPerTeam.get(team) ?? 0) + 1
            );

            if (!analyst || isExcludedAnalystName(analyst)) return;

            if (!perTeam.has(team)) {
                perTeam.set(team, new Map());
            }

            const analystMap = perTeam.get(team)!;

            analystMap.set(
                analyst,
                (analystMap.get(analyst) ?? 0) + 1
            );

        }

        fixtures.forEach((game) => {

            if (game.home_team) {
                addTeamAppearance(game.home_team, game.home_allocated);
            }

            if (game.away_team) {
                addTeamAppearance(game.away_team, game.away_allocated);
            }

        });

        const result: TeamCoder[] = [...totalGamesPerTeam.entries()]
            .map(([team, totalGames]) => {

                const analystMap = perTeam.get(team);

                const top = analystMap
                    ? [...analystMap.entries()].sort((a, b) => b[1] - a[1])[0]
                    : undefined;

                return {
                    team,
                    totalGames,
                    topAnalyst: top ? top[0] : null,
                    topGames: top ? top[1] : 0,
                };

            })
            .sort((a, b) => a.team.localeCompare(b.team));

        return result;

    }, [fixtures]);

    if (loading) {

        return (
            <div
                className="min-h-screen p-10 text-slate-200"
                style={{ background: THEME.bg }}
            >
                Loading competitions...
            </div>
        );

    }

    return (
        <div
            className="min-h-screen p-6 text-slate-200"
            style={{ background: THEME.bg }}
        >

            <div className="mx-auto max-w-6xl">

                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">

                    <div>
                        <h1 className="mb-1 text-3xl font-bold text-white">
                            Competitions
                        </h1>

                        <p className="text-sm text-slate-500">
                            Fixtures and analyst coverage by competition.
                        </p>
                    </div>

                    <Link
                        href="/fixtures"
                        className="
                            inline-flex
                            items-center
                            gap-2
                            rounded-lg
                            border
                            border-slate-700
                            bg-[#0f1b2d]
                            px-4
                            py-2
                            text-sm
                            font-medium
                            text-slate-200
                            transition
                            hover:border-sky-500/50
                            hover:bg-slate-800
                            hover:text-white
                        "
                    >
                        ← Back to Fixtures
                    </Link>

                </div>

                {/* COMPETITION SELECT */}
                <div className="mb-6">

                    <label className="mb-2 block text-sm text-slate-400">
                        Competition
                    </label>

                    <select
                        value={selectedCompetition}
                        onChange={(e) => setSelectedCompetition(e.target.value)}
                        className="
                            w-full
                            max-w-md
                            rounded-lg
                            border
                            border-slate-700
                            bg-[#0f1b2d]
                            px-4
                            py-3
                            text-sm
                            text-slate-200
                            focus:outline-none
                            focus:ring-1
                            focus:ring-sky-400
                        "
                    >
                        {competitions.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>

                </div>

                {competitions.length === 0 ? (

                    <div className="rounded-xl border border-slate-700 bg-[#0f1b2d] p-10 text-center text-slate-500">
                        No competitions found.
                    </div>

                ) : (

                    <>

                        {/* FIXTURES TABLE */}
                        <div className="mb-8 overflow-hidden rounded-2xl border border-slate-700 bg-[#0f1b2d]">

                            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">

                                <div className="text-sm font-semibold text-white">
                                    Fixtures — {selectedCompetition}
                                </div>

                                <div className="text-xs uppercase tracking-wide text-slate-500">
                                    {fixtures.length} game{fixtures.length === 1 ? "" : "s"}
                                </div>

                            </div>

                            <div className="max-h-[480px] overflow-y-auto">

                                <table className="w-full text-left text-sm">

                                    <thead className="sticky top-0 bg-slate-800 text-xs uppercase tracking-wide text-slate-400">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold">Wk</th>
                                            <th className="px-4 py-3 font-semibold">Rnd</th>
                                            <th className="px-4 py-3 font-semibold">Home</th>
                                            <th className="px-4 py-3 font-semibold">Home Analyst</th>
                                            <th className="px-4 py-3 font-semibold">Away</th>
                                            <th className="px-4 py-3 font-semibold">Away Analyst</th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-slate-800">

                                        {fixtures.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={6}
                                                    className="px-4 py-6 text-center text-slate-500"
                                                >
                                                    No fixtures for this competition.
                                                </td>
                                            </tr>
                                        ) : (
                                            fixtures.map((game, i) => (
                                                <tr
                                                    key={`${game.game_key}-${i}`}
                                                    className="transition hover:bg-slate-800/50"
                                                >
                                                    <td className="px-4 py-2.5 font-semibold text-sky-400">
                                                        {game.Week}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-400">
                                                        {game.Round}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-200">
                                                        {game.home_team}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-300">
                                                        {game.home_allocated || (
                                                            <span className="text-slate-600">
                                                                Unassigned
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-200">
                                                        {game.away_team}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-300">
                                                        {game.away_allocated || (
                                                            <span className="text-slate-600">
                                                                Unassigned
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}

                                    </tbody>

                                </table>

                            </div>

                        </div>

                        {/* ANALYTICS CARDS */}
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

                            {/* TOP ANALYSTS */}
                            <div className="rounded-2xl border border-slate-700 bg-[#0f1b2d] p-5">

                                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
                                    Most Games Coded
                                </h2>

                                {topAnalysts.length === 0 ? (
                                    <div className="text-sm text-slate-500">
                                        No analysts have coded this competition yet.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {topAnalysts.map((a, index) => {

                                            const image = getAnalystImage(a.name);
                                            const initials = getAnalystInitials(a.name);

                                            return (
                                                <div
                                                    key={a.name}
                                                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-900"
                                                >
                                                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                                                        {index + 1}
                                                    </div>

                                                    <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full ring-2 ring-slate-700">
                                                        <TeamCoderAvatar
                                                            src={image}
                                                            initials={initials}
                                                        />
                                                    </div>

                                                    <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">
                                                        {a.name}
                                                    </div>

                                                    <div className="flex-shrink-0 text-sm font-bold text-sky-400">
                                                        {a.games.toFixed(1)}
                                                    </div>
                                                </div>
                                            );

                                        })}
                                    </div>
                                )}

                            </div>

                            {/* TEAM CODERS */}
                            <div className="rounded-2xl border border-slate-700 bg-[#0f1b2d] p-5">

                                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
                                    Top Coder by Team
                                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-bold normal-case text-sky-300">
                                        {teamCoders.length}
                                    </span>
                                </h2>

                                <div className="max-h-[360px] space-y-1 overflow-y-auto">

                                    {teamCoders.length === 0 ? (
                                        <div className="text-sm text-slate-500">
                                            No team data available.
                                        </div>
                                    ) : (
                                        teamCoders.map((tc) => (
                                            <div
                                                key={tc.team}
                                                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-900"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium text-slate-200">
                                                        {tc.team}
                                                    </div>

                                                    <div className="truncate text-xs text-slate-500">
                                                        {tc.topAnalyst ?? "No analyst recorded"}
                                                    </div>
                                                </div>

                                                <div className="flex-shrink-0 text-right">
                                                    <div className="text-sm font-bold text-emerald-400">
                                                        {tc.topGames}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500">
                                                        of {tc.totalGames}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}

                                </div>

                            </div>

                        </div>

                    </>

                )}

            </div>

        </div>
    );

}

function TeamCoderAvatar({
    src,
    initials,
}: {
    src: string;
    initials: string;
}) {

    const [errored, setErrored] = useState(false);

    useEffect(() => {
        setErrored(false);
    }, [src]);

    if (errored) {
        return (
            <div
                className="flex h-full w-full items-center justify-center text-[10px] font-bold"
                style={{ background: THEME.panel, color: THEME.accent }}
            >
                {initials}
            </div>
        );
    }

    return (
        <img
            src={src}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
        />
    );

}
