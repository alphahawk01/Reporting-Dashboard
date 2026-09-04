"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, ChevronDown, ChevronRight } from "lucide-react";
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

type CheckGroup = {
    checkId: number;
    label: string;
    analyst: string;
    date: string | null;
    disputes: Dispute[];
    openCount: number;
};

export default function DisputesPage() {
    const router = useRouter();
    const { user, ready } = useAuth();
    const canResolve = user?.role === "admin" || user?.role === "super_admin";

    const [disputes, setDisputes] = useState<Dispute[]>([]);
    const [checks, setChecks] = useState<AccuracyCheck[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>("open");
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [search, setSearch] = useState("");

    // Open the disputed instance in the Accuracy Comparison video review.
    function openInReview(d: Dispute) {
        const params = new URLSearchParams({ check: String(d.check_id) });
        if (d.code_time != null) params.set("seek", String(d.code_time));
        if (d.stat) params.set("stat", d.stat);
        router.push(`/accuracy-compare?${params.toString()}`);
    }

    async function load() {
        try {
            setLoading(true);
            const [d, c] = await Promise.all([
                getAllDisputes(),
                getAllAccuracyChecks().catch(() => [] as AccuracyCheck[]),
            ]);

            // Admins/super admins see everything. Analysts see ONLY disputes
            // on checks saved against their own name (nothing if unallocated).
            const isAdmin =
                user?.role === "admin" || user?.role === "super_admin";
            const own = user?.analyst_name?.trim().toLowerCase() ?? "";

            if (isAdmin) {
                setChecks(c);
                setDisputes(d);
            } else {
                const ownChecks = c.filter(
                    (chk) => !!own && chk.analyst_name.trim().toLowerCase() === own
                );
                const ownIds = new Set(ownChecks.map((chk) => chk.id));
                setChecks(ownChecks);
                setDisputes(d.filter((dis) => ownIds.has(dis.check_id)));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!ready) return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, user?.role, user?.analyst_name]);

    const checkById = useMemo(() => {
        const m = new Map<number, AccuracyCheck>();
        for (const c of checks) m.set(c.id, c);
        return m;
    }, [checks]);

    function labelFor(checkId: number): string {
        const c = checkById.get(checkId);
        if (!c) return `Check #${checkId}`;
        return (
            c.match_label ||
            `${c.analyst_name}${
                c.file_name_analyst ? ` · ${c.file_name_analyst}` : ""
            }`
        );
    }

    // Filtered disputes, then grouped by check.
    const groups = useMemo(() => {
        const matchesFilter = (d: Dispute) =>
            filter === "all"
                ? true
                : filter === "open"
                  ? d.status === "open"
                  : d.status !== "open";

        const byCheck = new Map<number, Dispute[]>();
        for (const d of disputes) {
            if (!matchesFilter(d)) continue;
            const arr = byCheck.get(d.check_id) ?? [];
            arr.push(d);
            byCheck.set(d.check_id, arr);
        }

        const q = search.trim().toLowerCase();
        const result: CheckGroup[] = [];
        for (const [checkId, ds] of byCheck.entries()) {
            const c = checkById.get(checkId);
            const label = labelFor(checkId);
            const analyst = c?.analyst_name ?? "";
            if (q && !`${label} ${analyst}`.toLowerCase().includes(q)) continue;
            result.push({
                checkId,
                label,
                analyst,
                date: c?.created_at ?? null,
                disputes: ds.sort(
                    (a, b) =>
                        (a.code_time ?? 0) - (b.code_time ?? 0)
                ),
                openCount: ds.filter((d) => d.status === "open").length,
            });
        }
        // Checks with open disputes first, then most disputes, then newest.
        return result.sort((a, b) => {
            if (a.openCount !== b.openCount) return b.openCount - a.openCount;
            if (a.disputes.length !== b.disputes.length)
                return b.disputes.length - a.disputes.length;
            return (b.date ?? "").localeCompare(a.date ?? "");
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [disputes, checkById, filter, search]);

    function toggle(checkId: number) {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(checkId)) next.delete(checkId);
            else next.add(checkId);
            return next;
        });
    }

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

    function fmtDate(iso: string | null) {
        if (!iso) return "";
        return new Date(iso).toLocaleDateString("en-AU", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    }

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
                        Grouped by accuracy check.{" "}
                        <span className="font-semibold text-amber-600">
                            {counts.open} open
                        </span>{" "}
                        · {counts.total} total across {groups.length} check
                        {groups.length === 1 ? "" : "s"}.
                    </p>
                </div>

                {/* Filter + search */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
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
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search check or analyst…"
                        className="ml-auto w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500"
                    />
                </div>

                {groups.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
                        No {filter === "all" ? "" : filter} disputes.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {groups.map((g) => {
                            const isOpen = expanded.has(g.checkId);
                            return (
                                <div
                                    key={g.checkId}
                                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                                >
                                    <button
                                        onClick={() => toggle(g.checkId)}
                                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                                    >
                                        {isOpen ? (
                                            <ChevronDown
                                                size={16}
                                                className="shrink-0 text-slate-400"
                                            />
                                        ) : (
                                            <ChevronRight
                                                size={16}
                                                className="shrink-0 text-slate-400"
                                            />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-slate-800">
                                                {g.label}
                                            </p>
                                            <p className="truncate text-xs text-slate-500">
                                                {g.analyst}
                                                {g.date
                                                    ? ` · ${fmtDate(g.date)}`
                                                    : ""}
                                            </p>
                                        </div>
                                        {g.openCount > 0 && (
                                            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                                                {g.openCount} open
                                            </span>
                                        )}
                                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                                            {g.disputes.length} total
                                        </span>
                                    </button>

                                    {isOpen && (
                                        <div className="border-t border-slate-100 bg-slate-50/60 p-3">
                                            <DisputesPanel
                                                disputes={g.disputes}
                                                canResolve={canResolve}
                                                onResolve={handleResolve}
                                                onOpen={openInReview}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
