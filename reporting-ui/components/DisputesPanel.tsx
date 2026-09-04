"use client";

import { useState } from "react";
import { Flag, Check, X, Clock } from "lucide-react";
import type { Dispute } from "@/lib/api/disputes";

function statusBadge(status: Dispute["status"]) {
    switch (status) {
        case "confirmed":
            return "bg-emerald-100 text-emerald-700";
        case "denied":
            return "bg-slate-200 text-slate-600";
        default:
            return "bg-amber-100 text-amber-700";
    }
}

function fmtTime(t: number | null): string {
    if (t == null) return "—";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Shared list of disputes with resolve controls. Used both in the per-check
 * panel (Accuracy History) and the global Disputes page.
 */
export default function DisputesPanel({
    disputes,
    canResolve,
    onResolve,
    showCheckColumn,
    checkLabel,
}: {
    disputes: Dispute[];
    canResolve: boolean;
    onResolve: (
        disputeId: number,
        status: "confirmed" | "denied",
        note: string | null
    ) => void | Promise<void>;
    /** Show which check each dispute belongs to (global page). */
    showCheckColumn?: boolean;
    /** Resolve a check_id to a human label (global page). */
    checkLabel?: (checkId: number) => string;
}) {
    if (disputes.length === 0) {
        return (
            <p className="py-3 text-center text-sm text-slate-400">
                No disputes for this check.
            </p>
        );
    }

    return (
        <div className="space-y-2">
            {disputes.map((d) => (
                <DisputeRow
                    key={d.id}
                    dispute={d}
                    canResolve={canResolve}
                    onResolve={onResolve}
                    showCheckColumn={showCheckColumn}
                    checkLabel={checkLabel}
                />
            ))}
        </div>
    );
}

function DisputeRow({
    dispute: d,
    canResolve,
    onResolve,
    showCheckColumn,
    checkLabel,
}: {
    dispute: Dispute;
    canResolve: boolean;
    onResolve: (
        disputeId: number,
        status: "confirmed" | "denied",
        note: string | null
    ) => void | Promise<void>;
    showCheckColumn?: boolean;
    checkLabel?: (checkId: number) => string;
}) {
    const [note, setNote] = useState("");
    const open = d.status === "open";

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                    <Flag size={14} className="text-amber-600" />
                    <span className="font-semibold text-slate-800">
                        {d.stat || "—"}
                    </span>
                    <span className="text-slate-500">
                        {d.side === "master" ? "Master" : "Analyst"}
                        {d.team ? ` · ${d.team}` : ""}
                        {d.player ? ` · ${d.player}` : ""}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Clock size={11} /> {fmtTime(d.code_time)}
                    </span>
                </div>
                <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge(
                        d.status
                    )}`}
                >
                    {d.status}
                </span>
            </div>

            {showCheckColumn && checkLabel && (
                <p className="mt-1 text-xs text-slate-400">
                    Check: {checkLabel(d.check_id)}
                </p>
            )}

            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                {d.raised_by && <span>Raised by {d.raised_by}</span>}
                {d.reason && <span>Reason: {d.reason}</span>}
            </div>

            {d.status !== "open" && (
                <p className="mt-1 text-xs text-slate-500">
                    {d.status === "confirmed" ? "Confirmed" : "Denied"}
                    {d.resolved_by ? ` by ${d.resolved_by}` : ""}
                    {d.resolution_note ? ` · ${d.resolution_note}` : ""}
                </p>
            )}

            {open && canResolve && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Resolution note (optional)"
                        className="min-w-[180px] flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-slate-500"
                    />
                    <button
                        onClick={() =>
                            onResolve(d.id, "confirmed", note.trim() || null)
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                        <Check size={13} /> Confirm
                    </button>
                    <button
                        onClick={() =>
                            onResolve(d.id, "denied", note.trim() || null)
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
                    >
                        <X size={13} /> Deny
                    </button>
                </div>
            )}
        </div>
    );
}
