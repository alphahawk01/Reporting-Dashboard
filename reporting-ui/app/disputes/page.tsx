"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag } from "lucide-react";
import {
    getAllDisputes,
    resolveDispute,
    type Dispute,
} from "@/lib/api/disputes";
import {
    getAllAccuracyChecks,
    type AccuracyCheck,
} from "@/lib/api/accuracyChecks";
import { useAuth } from "@/components/auth/AuthContext";
import DisputesPanel from "@/components/DisputesPanel";

type Filter = "open" | "resolved" | "all";

export default function DisputesPage() {
    const { user } = useAuth();
    const canResolve = user?.role === "admin" || user?.role === "super_admin";

    const [disputes, setDisputes] = useState<Dispute[]>([]);
    const [checks, setChecks] = useState<AccuracyCheck[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>("open");

    async function load() {
        try {
            setLoading(true);
            const [d, c] = await Promise.all([
                getAllDisputes(),
                getAllAccuracyChecks().catch(() => [] as AccuracyCheck[]),
            ]);
            setDisputes(d);
            setChecks(c);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    // check_id -> label ("Analyst · match" or a fallback).
    const checkLabels = useMemo(() => {
        const m: Record<number, string> = {};
        for (const c of checks) {
            m[c.id] =
                c.match_label ||
                `${c.analyst_name}${
                    c.file_name_analyst ? ` · ${c.file_name_analyst}` : ""
                }`;
        }
        return m;
    }, [checks]);

    const filtered = useMemo(() => {
        if (filter === "all") return disputes;
        if (filter === "open") return disputes.filter((d) => d.status === "open");
        return disputes.filter((d) => d.status !== "open");
    }, [disputes, filter]);

    async function handleResolve(
        disputeId: number,
        status: "confirmed" | "denied",
        note: string | null
    ) {
        try {
            await resolveDispute(disputeId, status, user?.username ?? null, note);
            await load();
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to resolve.");
        }
    }

    const counts = useMemo(() => {
        const open = disputes.filter((d) => d.status === "open").length;
        return { open, total: disputes.length };
    }, [disputes]);

    if (loading) {
        return (
            <div className="min-h-full bg-slate-100 p-8 text-slate-600">
                Loading disputes...
            </div>
        );
    }

    return (
        <div className="min-h-full bg-slate-100 text-slate-900">
            <div className="mx-auto max-w-4xl p-6 lg:p-8">
                <div className="mb-6">
                    <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
                        <Flag size={26} /> Disputes
                    </h1>
                    <p className="mt-2 text-sm text-slate-600">
                        Flagged instances across all accuracy checks.{" "}
                        <span className="font-semibold text-amber-600">
                            {counts.open} open
                        </span>{" "}
                        · {counts.total} total.
                    </p>
                </div>

                {/* Filter */}
                <div className="mb-4 flex items-center gap-1.5">
                    {(["open", "resolved", "all"] as Filter[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                                filter === f
                                    ? "bg-slate-900 text-white"
                                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                {filtered.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
                        No {filter === "all" ? "" : filter} disputes.
                    </div>
                ) : (
                    <DisputesPanel
                        disputes={filtered}
                        canResolve={canResolve}
                        onResolve={handleResolve}
                        showCheckColumn
                        checkLabel={(id) => checkLabels[id] ?? `Check #${id}`}
                    />
                )}
            </div>
        </div>
    );
}
