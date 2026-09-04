"use client";

import { useState } from "react";
import { X, UserPlus, Users } from "lucide-react";
import {
    createAnalyst,
    createAnalystsBulk,
    type NewAnalystEntry,
} from "@/lib/api/analysts";

type Mode = "single" | "bulk";

/**
 * Parse the bulk textarea. One analyst per line. Optional email after a
 * comma (or tab), e.g.
 *   Corey Burl
 *   Daniel Jovanoski, daniel@example.com
 */
function parseBulk(text: string): NewAnalystEntry[] {
    const entries: NewAnalystEntry[] = [];
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const [namePart, ...rest] = trimmed.split(/[,\t]/);
        const name = namePart.trim();
        if (!name) continue;
        const email = rest.join(",").trim();
        entries.push({ name, email: email || null });
    }
    return entries;
}

export default function AddAnalystModal({
    open,
    onClose,
    onSaved,
}: {
    open: boolean;
    onClose: () => void;
    onSaved: () => void | Promise<void>;
}) {
    const [mode, setMode] = useState<Mode>("single");

    // Single
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");

    // Bulk
    const [bulkText, setBulkText] = useState("");

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    if (!open) return null;

    function reset() {
        setName("");
        setEmail("");
        setBulkText("");
        setError(null);
        setMessage(null);
    }

    function handleClose() {
        reset();
        onClose();
    }

    async function handleSubmit() {
        setError(null);
        setMessage(null);

        try {
            setSaving(true);

            if (mode === "single") {
                const clean = name.trim();
                if (!clean) {
                    setError("Enter an analyst name.");
                    return;
                }
                await createAnalyst(clean, email);
                setMessage(`Added "${clean}".`);
                setName("");
                setEmail("");
            } else {
                const entries = parseBulk(bulkText);
                if (entries.length === 0) {
                    setError("Enter at least one name (one per line).");
                    return;
                }
                const result = await createAnalystsBulk(entries);
                setMessage(
                    `Added ${result.added} analyst${
                        result.added === 1 ? "" : "s"
                    }` +
                        (result.skipped > 0
                            ? ` · skipped ${result.skipped} duplicate${
                                  result.skipped === 1 ? "" : "s"
                              }`
                            : "") +
                        "."
                );
                setBulkText("");
            }

            await onSaved();
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to add analyst."
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={handleClose}
        >
            <div
                className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 p-5">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                        <UserPlus size={20} /> Add analyst
                    </h2>
                    <button
                        onClick={handleClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Mode toggle */}
                <div className="flex gap-1 p-5 pb-0">
                    <button
                        onClick={() => {
                            setMode("single");
                            setError(null);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                            mode === "single"
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                    >
                        <UserPlus size={14} /> Single
                    </button>
                    <button
                        onClick={() => {
                            setMode("bulk");
                            setError(null);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                            mode === "bulk"
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                    >
                        <Users size={14} /> Bulk add
                    </button>
                </div>

                {/* Body */}
                <div className="space-y-3 p-5">
                    {mode === "single" ? (
                        <>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-500">
                                    Name
                                </label>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Corey Burl"
                                    autoFocus
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-500">
                                    Email{" "}
                                    <span className="text-slate-400">
                                        (optional)
                                    </span>
                                </label>
                                <input
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="e.g. corey@example.com"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                                />
                            </div>
                        </>
                    ) : (
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-500">
                                One analyst per line. Email is optional after a
                                comma.
                            </label>
                            <textarea
                                value={bulkText}
                                onChange={(e) => setBulkText(e.target.value)}
                                rows={8}
                                autoFocus
                                placeholder={
                                    "Corey Burl\nDaniel Jovanoski, daniel@example.com\nJane Smith"
                                }
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-blue-500"
                            />
                            <p className="mt-1 text-xs text-slate-400">
                                Duplicates (by name, case-insensitive) are
                                skipped automatically.
                            </p>
                        </div>
                    )}

                    {error && (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                            {error}
                        </p>
                    )}
                    {message && (
                        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                            {message}
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-5">
                    <button
                        onClick={handleClose}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        Close
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        <UserPlus size={15} />
                        {saving
                            ? "Adding..."
                            : mode === "single"
                              ? "Add analyst"
                              : "Add analysts"}
                    </button>
                </div>
            </div>
        </div>
    );
}
