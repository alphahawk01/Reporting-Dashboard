import { supabase } from "@/lib/supabase";

// ======================================================================
// Instance disputes: flag a specific coded instance in a saved accuracy
// check, then resolve (confirm/deny) it.
// ======================================================================

export type DisputeSide = "master" | "analyst";
export type DisputeStatus = "open" | "confirmed" | "denied";

// How the analyst categorises a flag, so disputes can be reviewed by type
// rather than as one undifferentiated list.
export type DisputeCategory =
    | "player_identification"
    | "stat_difference"
    | "timing_comparison";

// Display labels for each category, in the order shown in the dropdown / UI.
export const DISPUTE_CATEGORIES: {
    value: DisputeCategory;
    label: string;
}[] = [
    { value: "player_identification", label: "Player Identification" },
    { value: "stat_difference", label: "Stat Difference" },
    { value: "timing_comparison", label: "Timing/Comparison Error" },
];

export function disputeCategoryLabel(
    category: DisputeCategory | null | undefined
): string {
    return (
        DISPUTE_CATEGORIES.find((c) => c.value === category)?.label ??
        "Uncategorised"
    );
}

export interface Dispute {
    id: number;
    created_at: string;
    check_id: number;
    instance_id: string;
    side: DisputeSide;
    stat: string | null;
    player: string | null;
    team: string | null;
    code_time: number | null;
    raised_by: string | null;
    reason: string | null;
    /** Analyst-chosen flag category. Null on legacy disputes. */
    category: DisputeCategory | null;
    status: DisputeStatus;
    resolved_by: string | null;
    resolved_at: string | null;
    resolution_note: string | null;
}

export interface NewDispute {
    checkId: number;
    instanceId: string;
    side: DisputeSide;
    stat?: string | null;
    player?: string | null;
    team?: string | null;
    codeTime?: number | null;
    raisedBy?: string | null;
    reason?: string | null;
    category?: DisputeCategory | null;
}

/** Flag an instance. Upserts so re-flagging the same instance is a no-op. */
export async function createDispute(input: NewDispute): Promise<Dispute> {
    // Does a dispute already exist for this instance/side?
    const { data: existing } = await supabase
        .from("accuracy_disputes")
        .select("*")
        .eq("check_id", input.checkId)
        .eq("instance_id", input.instanceId)
        .eq("side", input.side)
        .maybeSingle();

    if (existing) {
        // Re-flagging: only update the reason IF a new one was supplied, so an
        // empty submit never wipes an existing reason. The category is updated
        // whenever a new one is supplied. Never reset status.
        const patch: Record<string, unknown> = {};
        if (input.reason != null && input.reason.trim() !== "") {
            patch.reason = input.reason.trim();
        }
        if (input.category != null) {
            patch.category = input.category;
        }
        if (Object.keys(patch).length === 0) {
            return existing as Dispute;
        }
        const { data, error } = await supabase
            .from("accuracy_disputes")
            .update(patch)
            .eq("id", (existing as Dispute).id)
            .select("*")
            .single();
        if (error) {
            console.error("Failed updating dispute reason:", error);
            throw new Error(error.message || "Failed updating dispute");
        }
        return data as Dispute;
    }

    // New dispute.
    const { data, error } = await supabase
        .from("accuracy_disputes")
        .insert({
            check_id: input.checkId,
            instance_id: input.instanceId,
            side: input.side,
            stat: input.stat ?? null,
            player: input.player ?? null,
            team: input.team ?? null,
            code_time: input.codeTime ?? null,
            raised_by: input.raisedBy ?? null,
            reason: input.reason?.trim() || null,
            category: input.category ?? null,
            status: "open",
        })
        .select("*")
        .single();

    if (error) {
        console.error("Failed creating dispute:", error);
        throw new Error(error.message || "Failed creating dispute");
    }
    return data as Dispute;
}

/** All disputes for one saved check. */
export async function getDisputesForCheck(
    checkId: number
): Promise<Dispute[]> {
    const { data, error } = await supabase
        .from("accuracy_disputes")
        .select("*")
        .eq("check_id", checkId)
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Failed loading disputes:", error);
        throw new Error(error.message || "Failed loading disputes");
    }
    return (data ?? []) as Dispute[];
}

/** Every dispute across all checks (for the global Disputes page). */
export async function getAllDisputes(): Promise<Dispute[]> {
    const { data, error } = await supabase
        .from("accuracy_disputes")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Failed loading disputes:", error);
        throw new Error(error.message || "Failed loading disputes");
    }
    return (data ?? []) as Dispute[];
}

/** Count of open disputes per check_id (for history badges). */
export async function getOpenDisputeCounts(): Promise<Record<number, number>> {
    const { data, error } = await supabase
        .from("accuracy_disputes")
        .select("check_id")
        .eq("status", "open");

    if (error) {
        console.error("Failed loading dispute counts:", error);
        return {};
    }
    const counts: Record<number, number> = {};
    for (const r of data ?? []) {
        const id = (r as { check_id: number }).check_id;
        counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
}

/** Confirm or deny a dispute, optionally with a resolution note. */
export async function resolveDispute(
    id: number,
    status: "confirmed" | "denied",
    resolvedBy: string | null,
    note?: string | null
): Promise<void> {
    const { error } = await supabase
        .from("accuracy_disputes")
        .update({
            status,
            resolved_by: resolvedBy,
            resolved_at: new Date().toISOString(),
            resolution_note: note?.trim() || null,
        })
        .eq("id", id);

    if (error) {
        console.error("Failed resolving dispute:", error);
        throw new Error(error.message || "Failed resolving dispute");
    }
}

/** Remove a dispute (e.g. flagged by mistake). */
export async function deleteDispute(id: number): Promise<void> {
    const { error } = await supabase
        .from("accuracy_disputes")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Failed deleting dispute:", error);
        throw new Error(error.message || "Failed deleting dispute");
    }
}

/** Build a set of "instanceId|side" keys for quick flagged-lookups. */
export function disputeKeySet(disputes: Dispute[]): Set<string> {
    return new Set(disputes.map((d) => `${d.instance_id}|${d.side}`));
}

export function disputeKey(instanceId: string, side: DisputeSide): string {
    return `${instanceId}|${side}`;
}
