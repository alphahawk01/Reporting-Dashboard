"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, ChevronDown, ChevronRight, X as XIcon, Check, Clock } from "lucide-react";
import {
    getAllDisputes,
    resolveDispute,
    type Dispute,
} from "@/lib/api/disputes";
import {
    getAccuracyChecksMeta,
    getAccuracyCheckById,
    type AccuracyCheckMeta,
} from "@/lib/api/accuracyChecks";
import {
    parseInstances,
    compareInstances,
    canonicaliseTeams,
    formatTime,
    type ComparisonRow,
    type Instance,
} from "@/lib/comparison/xml-compare";
import { useAuth } from "@/components/auth/AuthContext";
import DisputesPanel from "@/components/DisputesPanel";
import SportToggle, { type SportFilter } from "@/components/SportToggle";

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
    const { user, ready } = useAuth();
    const canResolve = user?.role === "admin" || user?.role === "super_admin";

    const [disputes, setDisputes] = useState<Dispute[]>([]);
    const [checks, setChecks] = useState<AccuracyCheckMeta[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>("open");
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [search, setSearch] = useState("");
    const [sportFilter, setSportFilter] = useState<SportFilter>("all");

    // Self-contained review pop-up (Option B): the disputed instance's video
    // clip + inline resolve, without leaving the Disputes page.
    const [reviewing, setReviewing] = useState<{
        dispute: Dispute;
        videoUrl: string | null;
    } | null>(null);

    // Open the disputed instance in a review pop-up on this page.
    function openInReview(d: Dispute) {
        const check = checks.find((c) => c.id === d.check_id);
        setReviewing({ dispute: d, videoUrl: check?.video_url ?? null });
    }

    async function load() {
        try {
            setLoading(true);
            const [d, c] = await Promise.all([
                getAllDisputes(),
                getAccuracyChecksMeta().catch(() => [] as AccuracyCheckMeta[]),
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
        const m = new Map<number, AccuracyCheckMeta>();
        for (const c of checks) m.set(c.id, c);
        return m;
    }, [checks]);

    // Effective sport per check: use the stored value; legacy checks without
    // one default to "afl". (The check list no longer carries raw XML, so we
    // rely on the stored sport column rather than parsing it.)
    const sportByCheck = useMemo(() => {
        const m = new Map<number, "afl" | "football">();
        for (const c of checks) {
            const stored =
                c.sport === "afl" || c.sport === "football" ? c.sport : null;
            m.set(c.id, stored ?? "afl");
        }
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

        const matchesSport = (checkId: number) => {
            if (sportFilter === "all") return true;
            return sportByCheck.get(checkId) === sportFilter;
        };

        const byCheck = new Map<number, Dispute[]>();
        for (const d of disputes) {
            if (!matchesFilter(d)) continue;
            if (!matchesSport(d.check_id)) continue;
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
    }, [disputes, checkById, sportByCheck, filter, search, sportFilter]);

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
            // If we resolved the one being reviewed, close the pop-up.
            setReviewing((cur) =>
                cur && cur.dispute.id === disputeId ? null : cur
            );
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
                    <SportToggle value={sportFilter} onChange={setSportFilter} />
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

            {reviewing && (
                <DisputeReviewModal
                    dispute={reviewing.dispute}
                    videoUrl={reviewing.videoUrl}
                    canResolve={canResolve}
                    onResolve={handleResolve}
                    onClose={() => setReviewing(null)}
                />
            )}
        </div>
    );
}

// -----------------------------------------------------------------------
// Self-contained review pop-up: plays the disputed instance's video clip
// and lets an admin resolve it (Analyst correct / Master correct) inline.
// -----------------------------------------------------------------------
function fmtClock(t: number | null): string {
    if (t == null) return "—";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function DisputeReviewModal({
    dispute: d,
    videoUrl,
    canResolve,
    onResolve,
    onClose,
}: {
    dispute: Dispute;
    videoUrl: string | null;
    canResolve: boolean;
    onResolve: (
        disputeId: number,
        status: "confirmed" | "denied",
        note: string | null
    ) => void | Promise<void>;
    onClose: () => void;
}) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const activeRowRef = useRef<HTMLDivElement | null>(null);
    const [note, setNote] = useState("");
    const [videoTime, setVideoTime] = useState(0);
    const [rows, setRows] = useState<ComparisonRow[]>([]);
    const [loadingRows, setLoadingRows] = useState(true);
    // Real club names for the canonical Home/Away sides (from the master).
    const [teamNames, setTeamNames] = useState<{
        home: string | null;
        away: string | null;
    }>({ home: null, away: null });

    // Load + parse the check's stored XML to build both timelines.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingRows(true);
            try {
                const check = await getAccuracyCheckById(d.check_id);
                if (!check || cancelled) return;
                const master = check.xml_master
                    ? parseInstances(check.xml_master)
                    : [];
                const analyst = check.xml_analyst
                    ? parseInstances(check.xml_analyst)
                    : [];
                const tol = check.tolerance ?? 3;
                const canon = canonicaliseTeams(
                    master,
                    analyst,
                    tol,
                    check.file_name_master
                );
                const result = compareInstances(
                    canon.master,
                    canon.analyst,
                    tol
                );
                if (!cancelled) {
                    setRows(result.rows);
                    setTeamNames(canon.displayNames);
                }
            } catch (err) {
                console.error("Failed building dispute timeline:", err);
            } finally {
                if (!cancelled) setLoadingRows(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [d.check_id]);

    // Seek to the disputed moment once the video is ready.
    useEffect(() => {
        const v = videoRef.current;
        if (!v || d.code_time == null) return;
        const seek = () => {
            try {
                v.currentTime = Math.max(0, d.code_time as number);
                v.play().catch(() => {});
            } catch {
                // ignore
            }
        };
        if (v.readyState >= 1) seek();
        else v.addEventListener("loadedmetadata", seek, { once: true });
    }, [d.code_time, videoUrl]);

    // Keep the disputed / active row in view.
    useEffect(() => {
        activeRowRef.current?.scrollIntoView({
            block: "nearest",
            behavior: "smooth",
        });
    }, [videoTime, rows]);

    // Canonical team -> real club name (from the master file) for display.
    const teamDisplay = (canonTeam: string): string => {
        const key = canonTeam.trim().toLowerCase();
        if (key === "home" && teamNames.home) return teamNames.home;
        if (key === "away" && teamNames.away) return teamNames.away;
        return canonTeam;
    };

    const seekTo = (seconds: number) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.max(0, seconds);
        v.play().catch(() => {});
    };

    const open = d.status === "open";

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 p-2 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="mx-auto flex h-full w-full max-w-[1800px] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-700 px-4 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                        <Flag size={15} className="text-amber-400" /> Review
                        dispute
                        <span className="text-xs font-normal text-slate-400">
                            {d.stat || "—"} ·{" "}
                            {d.side === "master" ? "Master" : "Analyst"}
                            {d.player ? ` · ${d.player}` : ""}
                            <span className="ml-1 inline-flex items-center gap-1">
                                <Clock size={11} /> {fmtClock(d.code_time)}
                            </span>
                        </span>
                    </span>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                        title="Close"
                    >
                        <XIcon size={18} />
                    </button>
                </div>

                {/* Body: video (left, larger) + both timelines (right) */}
                <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[2fr_1fr]">
                    {/* Video */}
                    <div className="flex min-h-0 items-center justify-center bg-black p-2">
                        {videoUrl ? (
                            <video
                                ref={videoRef}
                                src={videoUrl}
                                controls
                                onTimeUpdate={(e) =>
                                    setVideoTime(e.currentTarget.currentTime)
                                }
                                className="max-h-full max-w-full"
                            />
                        ) : (
                            <p className="text-sm text-slate-400">
                                No video URL saved for this check.
                            </p>
                        )}
                    </div>

                    {/* Timelines */}
                    <div className="flex min-h-0 flex-col border-t border-slate-700 lg:border-l lg:border-t-0">
                        <div className="grid grid-cols-[124px_1fr_1fr] border-b border-slate-700 bg-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            <div className="p-2.5">Status</div>
                            <div className="border-l border-slate-700 p-2.5">
                                Master
                            </div>
                            <div className="border-l border-slate-700 p-2.5">
                                Analyst
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
                            {loadingRows ? (
                                <p className="p-6 text-center text-sm text-slate-400">
                                    Loading timeline…
                                </p>
                            ) : (
                                rows.map((row, i) => {
                                    const isDisputed =
                                        (d.side === "master" &&
                                            row.master?.id === d.instance_id) ||
                                        (d.side === "analyst" &&
                                            row.analyst?.id === d.instance_id);
                                    const mActive =
                                        !!row.master &&
                                        videoTime >= row.master.start &&
                                        videoTime <= row.master.end;
                                    const aActive =
                                        !!row.analyst &&
                                        videoTime >= row.analyst.start &&
                                        videoTime <= row.analyst.end;
                                    const active = mActive || aActive;
                                    return (
                                        <div
                                            key={i}
                                            ref={
                                                isDisputed || active
                                                    ? activeRowRef
                                                    : undefined
                                            }
                                            className={`grid grid-cols-[124px_1fr_1fr] border-b text-sm last:border-b-0 ${
                                                isDisputed
                                                    ? "border-amber-300 bg-amber-50"
                                                    : active
                                                      ? "border-sky-400 bg-sky-50 shadow-[inset_4px_0_0_0_#0ea5e9]"
                                                      : "border-slate-100"
                                            }`}
                                        >
                                            <div className="flex items-center px-2 py-1">
                                                <span className="whitespace-nowrap text-[11px] font-semibold capitalize text-slate-500">
                                                    {row.status.replace(
                                                        "_",
                                                        " "
                                                    )}
                                                </span>
                                            </div>
                                            <MiniCell
                                                inst={row.master}
                                                onSeek={seekTo}
                                                active={mActive}
                                                teamLabel={
                                                    row.master
                                                        ? teamDisplay(
                                                              row.master.team
                                                          )
                                                        : undefined
                                                }
                                            />
                                            <MiniCell
                                                inst={row.analyst}
                                                onSeek={seekTo}
                                                active={aActive}
                                                teamLabel={
                                                    row.analyst
                                                        ? teamDisplay(
                                                              row.analyst.team
                                                          )
                                                        : undefined
                                                }
                                            />
                                        </div>
                                    );
                                })
                            )}
                            {!loadingRows && rows.length === 0 && (
                                <p className="p-6 text-center text-sm text-slate-400">
                                    No timeline data for this check.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Raised reason + resolve */}
                <div className="border-t border-slate-700 p-4">
                    <p className="mb-2 text-xs text-slate-400">
                        {d.raised_by ? `Raised by ${d.raised_by}` : "Raised"}
                        {d.reason ? ` — “${d.reason}”` : " — no reason given"}
                    </p>

                    {!open && (
                        <p className="text-sm font-semibold text-slate-200">
                            {d.status === "confirmed"
                                ? "Analyst correct"
                                : "Master correct"}
                            {d.resolved_by ? ` · by ${d.resolved_by}` : ""}
                            {d.resolution_note
                                ? ` · ${d.resolution_note}`
                                : ""}
                        </p>
                    )}

                    {open && canResolve && (
                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Resolution note (optional)"
                                className="min-w-[200px] flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
                            />
                            <button
                                onClick={() =>
                                    onResolve(
                                        d.id,
                                        "confirmed",
                                        note.trim() || null
                                    )
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                            >
                                <Check size={15} /> Analyst correct
                            </button>
                            <button
                                onClick={() =>
                                    onResolve(
                                        d.id,
                                        "denied",
                                        note.trim() || null
                                    )
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                            >
                                <Check size={15} /> Master correct
                            </button>
                        </div>
                    )}

                    {open && !canResolve && (
                        <p className="text-xs text-slate-500">
                            Awaiting admin review.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

// Compact timeline cell for the dispute review modal. Clickable to seek.
function MiniCell({
    inst,
    onSeek,
    active,
    teamLabel,
}: {
    inst: Instance | null;
    onSeek: (seconds: number) => void;
    active?: boolean;
    /** Real club name to show instead of the canonical "Home"/"Away". */
    teamLabel?: string;
}) {
    if (!inst) {
        return (
            <div className="border-l border-slate-200 px-2 py-1">
                <span className="text-[11px] italic text-slate-300">
                    — no entry —
                </span>
            </div>
        );
    }
    const teamKey = inst.team.trim().toLowerCase();
    const bg =
        teamKey === "home"
            ? "bg-emerald-50"
            : teamKey === "away"
              ? "bg-orange-50"
              : "";
    return (
        <div
            onClick={() => onSeek(inst.start)}
            title={`${formatTime(inst.mid)} · ${
                inst.stat || inst.category || "—"
            } · ${teamLabel ?? inst.team}${
                inst.playerNumber != null ? ` #${inst.playerNumber}` : ""
            } — jump to this moment`}
            className={`cursor-pointer border-l border-slate-200 px-2 py-1 hover:brightness-95 ${
                active ? "bg-sky-100 ring-2 ring-inset ring-sky-500" : bg
            }`}
        >
            {/* Single compact line: time · stat (truncates) · team/#player */}
            <div className="flex items-center gap-x-1.5 overflow-hidden whitespace-nowrap">
                <span className="shrink-0 font-mono text-[11px] font-semibold text-slate-500">
                    {formatTime(inst.mid)}
                </span>
                <span className="truncate text-xs font-semibold text-slate-900">
                    {inst.stat || inst.category || "—"}
                </span>
                <span className="ml-auto shrink-0 text-[11px] font-medium text-slate-500">
                    {teamLabel ?? inst.team}
                    {inst.playerNumber != null ? ` #${inst.playerNumber}` : ""}
                </span>
            </div>
        </div>
    );
}
