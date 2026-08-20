"use client";

import { useMemo, useState } from "react";

import type { Analyst } from "@/lib/api/analysts";
import type { Computer } from "@/lib/api/computers";

interface Props {
    computer: Computer | null;
    analysts: Analyst[];
    saving: boolean;
    onCancel: () => void;
    onConfirm: (
        analystId: number,
        location: "Home" | "Office"
    ) => void;
}

export default function AllocateAnalystModal({
    computer,
    analysts,
    saving,
    onCancel,
    onConfirm,
}: Props) {

    const [search, setSearch] = useState("");

    const [analystId, setAnalystId] =
        useState<number | null>(null);

    const [location, setLocation] =
        useState<"Home" | "Office">("Office");

    // Hooks must run unconditionally, so filter before the early return.
    const filtered = useMemo(() => {

        const term = search.trim().toLowerCase();

        if (!term) return analysts;

        return analysts.filter(a =>
            a.name.toLowerCase().includes(term) ||
            a.email?.toLowerCase().includes(term)
        );

    }, [analysts, search]);

    if (!computer) return null;

    const selected =
        analysts.find(a => a.id === analystId) ?? null;

    /*
     * If the chosen analyst already has a computer in the chosen slot,
     * assigning this one replaces it. Surface that before they commit.
     */
    const existing =
        location === "Home"
            ? selected?.homeComputer
            : selected?.officeComputer;

    const replacing =
        existing && existing.id !== computer.id
            ? existing.computerName
            : null;

    return (

        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={onCancel}
        >

            <div
                className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl"
                onClick={e => e.stopPropagation()}
            >

                {/* HEADER */}

                <div className="border-b border-slate-200 px-5 py-4">

                    <h2 className="text-lg font-bold text-slate-900">
                        Allocate Analyst
                    </h2>

                    <p className="mt-0.5 text-sm text-slate-500">
                        Assign an analyst and location to
                        <span className="ml-1 font-semibold text-slate-700">
                            {computer.computerName}
                        </span>
                    </p>

                </div>


                {/* LOCATION */}

                <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">

                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Location
                    </div>

                    <div className="flex gap-2">

                        {(["Office", "Home"] as const).map(option => (

                            <button
                                key={option}
                                type="button"
                                onClick={() => setLocation(option)}
                                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${location === option
                                    ? "border-sky-600 bg-sky-600 text-white"
                                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                                    }`}
                            >
                                {option}
                            </button>

                        ))}

                    </div>

                </div>


                {/* ANALYST PICKER */}

                <div className="px-5 py-4">

                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Analyst
                    </div>

                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search analyst..."
                        className="
                            mb-3
                            w-full
                            rounded-lg
                            border
                            border-slate-300
                            px-3
                            py-2
                            text-sm
                            outline-none
                            focus:border-sky-500
                            focus:ring-2
                            focus:ring-sky-100
                        "
                    />

                    <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">

                        {filtered.length === 0 && (
                            <div className="p-6 text-center text-sm text-slate-500">
                                No analysts match that search.
                            </div>
                        )}

                        {filtered.map(analyst => {

                            const slot =
                                location === "Home"
                                    ? analyst.homeComputer
                                    : analyst.officeComputer;

                            const isSelected =
                                analyst.id === analystId;

                            return (

                                <button
                                    key={analyst.id}
                                    type="button"
                                    onClick={() => setAnalystId(analyst.id)}
                                    className={`flex w-full items-center justify-between border-b border-slate-100 px-3 py-2.5 text-left last:border-0 transition ${isSelected
                                        ? "bg-sky-50"
                                        : "hover:bg-slate-50"
                                        }`}
                                >

                                    <div className="min-w-0">

                                        <div className="truncate text-sm font-semibold text-slate-900">
                                            {analyst.name}
                                        </div>

                                        <div className="truncate text-xs text-slate-500">
                                            {slot
                                                ? `${location}: ${slot.computerName}`
                                                : `No ${location.toLowerCase()} computer`}
                                        </div>

                                    </div>

                                    {isSelected && (
                                        <span className="ml-2 shrink-0 text-sm font-bold text-sky-600">
                                            ✓
                                        </span>
                                    )}

                                </button>

                            );

                        })}

                    </div>

                    {replacing && (

                        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            {selected?.name} currently has
                            <span className="mx-1 font-semibold">
                                {replacing}
                            </span>
                            as their {location.toLowerCase()} computer.
                            Continuing will replace it.
                        </div>

                    )}

                </div>


                {/* ACTIONS */}

                <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">

                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={saving}
                        className="
                            rounded-lg
                            border
                            border-slate-300
                            bg-white
                            px-4
                            py-2
                            text-sm
                            font-semibold
                            text-slate-700
                            transition
                            hover:bg-slate-100
                            disabled:opacity-50
                        "
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        disabled={!analystId || saving}
                        onClick={() => {
                            if (analystId) {
                                onConfirm(analystId, location);
                            }
                        }}
                        className="
                            rounded-lg
                            bg-sky-600
                            px-4
                            py-2
                            text-sm
                            font-semibold
                            text-white
                            transition
                            hover:bg-sky-700
                            disabled:cursor-not-allowed
                            disabled:bg-slate-300
                        "
                    >
                        {saving ? "Allocating..." : "Allocate"}
                    </button>

                </div>

            </div>

        </div>

    );
}
