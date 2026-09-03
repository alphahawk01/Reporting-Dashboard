import { supabase } from "@/lib/supabase";
import type {
    ComparisonResult,
    CategoryBreakdown,
    TeamBreakdown,
} from "@/lib/comparison/xml-compare";

/**
 * A saved accuracy check row (mirrors the accuracy_checks table).
 */
export interface AccuracyCheck {
    id: number;
    created_at: string;

    analyst_name: string;
    master_analyst_name: string | null;

    match_label: string | null;
    file_name_master: string | null;
    file_name_analyst: string | null;
    tolerance: number | null;

    accuracy: number;
    master_total: number;
    analyst_total: number;
    exact: number;
    wrong_stat: number;
    wrong_player: number;
    wrong_team: number;
    missed: number;
    extra: number;
    avg_time_drift: number;

    category_breakdown: CategoryBreakdown[] | null;
    team_breakdown: TeamBreakdown[] | null;

    // Raw source XML so a saved check can be fully re-opened.
    xml_master: string | null;
    xml_analyst: string | null;

    // Game video URL so it doesn't need to be re-found on re-open.
    video_url: string | null;

    // Sport the check was graded under ("afl" | "football"), so it
    // re-opens with the right player-stats table.
    sport: string | null;
}

export interface SaveAccuracyCheckInput {
    analystName: string;
    masterAnalystName?: string | null;
    xmlMaster?: string | null;
    xmlAnalyst?: string | null;
    videoUrl?: string | null;
    sport?: string | null;
    matchLabel?: string | null;
    fileNameMaster?: string | null;
    fileNameAnalyst?: string | null;
    tolerance?: number | null;
    result: ComparisonResult;
}

/**
 * Persists a comparison result as an accuracy check attributed to the
 * graded analyst (and, optionally, the analyst who coded the master).
 */
export async function saveAccuracyCheck(
    input: SaveAccuracyCheckInput
): Promise<AccuracyCheck> {
    const s = input.result.summary;

    const row = {
        analyst_name: input.analystName.trim(),
        master_analyst_name: input.masterAnalystName?.trim() || null,
        match_label: input.matchLabel?.trim() || null,
        file_name_master: input.fileNameMaster ?? null,
        file_name_analyst: input.fileNameAnalyst ?? null,
        tolerance: input.tolerance ?? null,

        accuracy: s.accuracy,
        master_total: s.masterTotal,
        analyst_total: s.analystTotal,
        exact: s.exact,
        wrong_stat: s.wrongStat,
        wrong_player: s.wrongPlayer,
        wrong_team: s.wrongTeam,
        missed: s.missed,
        extra: s.extra,
        avg_time_drift: s.avgTimeDrift,

        category_breakdown: input.result.byCategory ?? null,
        team_breakdown: input.result.byTeam ?? null,

        xml_master: input.xmlMaster ?? null,
        xml_analyst: input.xmlAnalyst ?? null,
        video_url: input.videoUrl?.trim() || null,
        sport: input.sport ?? null,
    };

    const { data, error } = await supabase
        .from("accuracy_checks")
        .insert(row)
        .select()
        .single();

    if (error) {
        console.error("Failed saving accuracy check:", error);
        throw new Error(error.message || "Failed saving accuracy check");
    }

    return data as AccuracyCheck;
}

export interface SavedMaster {
    fileName: string;
    xml: string;
    videoUrl: string | null;
}

/**
 * Distinct master XMLs already stored across saved checks, so a master
 * can be re-selected from a dropdown instead of re-uploaded each time.
 * De-duplicated by master file name (most recent wins).
 */
export async function getSavedMasters(): Promise<SavedMaster[]> {
    const { data, error } = await supabase
        .from("accuracy_checks")
        .select("file_name_master, xml_master, video_url, created_at")
        .not("xml_master", "is", null)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Failed loading saved masters:", error);
        return [];
    }

    const seen = new Set<string>();
    const masters: SavedMaster[] = [];
    for (const row of data ?? []) {
        const fileName = (row as any).file_name_master as string | null;
        const xml = (row as any).xml_master as string | null;
        if (!fileName || !xml) continue;
        const key = fileName.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        masters.push({
            fileName,
            xml,
            videoUrl: (row as any).video_url ?? null,
        });
    }
    return masters;
}

/**
 * Fetch a single accuracy check by id (used to re-open a saved check in
 * the Accuracy Comparison tab).
 */
export async function getAccuracyCheckById(
    id: number
): Promise<AccuracyCheck | null> {
    const { data, error } = await supabase
        .from("accuracy_checks")
        .select("*")
        .eq("id", id)
        .single();

    if (error) {
        console.error("Failed loading accuracy check:", error);
        return null;
    }

    return data as AccuracyCheck;
}

/**
 * All accuracy checks where this analyst was the one being graded,
 * newest first.
 */
export async function getAccuracyChecksForAnalyst(
    analystName: string
): Promise<AccuracyCheck[]> {
    const { data, error } = await supabase
        .from("accuracy_checks")
        .select("*")
        .ilike("analyst_name", analystName.trim())
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Failed loading accuracy checks:", error);
        throw new Error(error.message || "Failed loading accuracy checks");
    }

    return (data ?? []) as AccuracyCheck[];
}

/**
 * Every saved accuracy check (used to build leaderboards / summaries).
 */
export async function getAllAccuracyChecks(): Promise<AccuracyCheck[]> {
    const rows: AccuracyCheck[] = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from("accuracy_checks")
            .select("*")
            .order("created_at", { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) {
            console.error("Failed loading accuracy checks:", error);
            throw new Error(error.message || "Failed loading accuracy checks");
        }

        if (!data || data.length === 0) break;
        rows.push(...(data as AccuracyCheck[]));
        from += pageSize;
        if (data.length < pageSize) break;
    }

    return rows;
}

/**
 * Delete a saved accuracy check (e.g. a mistaken save).
 */
export async function deleteAccuracyCheck(id: number): Promise<void> {
    const { error } = await supabase
        .from("accuracy_checks")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Failed deleting accuracy check:", error);
        throw new Error(error.message || "Failed deleting accuracy check");
    }
}

// ---- Aggregations -------------------------------------------------

export interface MasterCheckCount {
    masterAnalystName: string;
    count: number;
}

/**
 * How many master accuracy checks each person has completed
 * (grouped by master_analyst_name), highest first.
 */
export function countMasterChecks(
    checks: AccuracyCheck[]
): MasterCheckCount[] {
    const map = new Map<string, number>();

    for (const c of checks) {
        const name = c.master_analyst_name?.trim();
        if (!name) continue;
        map.set(name, (map.get(name) ?? 0) + 1);
    }

    return Array.from(map.entries())
        .map(([masterAnalystName, count]) => ({ masterAnalystName, count }))
        .sort((a, b) => b.count - a.count);
}

export interface AnalystAccuracySummary {
    analystName: string;
    checks: number;
    avgAccuracy: number;
    latestAccuracy: number;
    totalMaster: number;
    totalExact: number;
}

/**
 * Per-graded-analyst rollup across all their checks.
 */
export function summariseByAnalyst(
    checks: AccuracyCheck[]
): AnalystAccuracySummary[] {
    const map = new Map<string, AccuracyCheck[]>();

    for (const c of checks) {
        const key = c.analyst_name.trim();
        if (!key) continue;
        const arr = map.get(key) ?? [];
        arr.push(c);
        map.set(key, arr);
    }

    return Array.from(map.entries())
        .map(([analystName, list]) => {
            // Newest first (getAllAccuracyChecks returns desc), so [0] is latest.
            const sorted = [...list].sort(
                (a, b) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime()
            );
            const totalMaster = list.reduce((sum, c) => sum + c.master_total, 0);
            const totalExact = list.reduce((sum, c) => sum + c.exact, 0);

            return {
                analystName,
                checks: list.length,
                avgAccuracy:
                    list.reduce((sum, c) => sum + c.accuracy, 0) / list.length,
                latestAccuracy: sorted[0]?.accuracy ?? 0,
                totalMaster,
                totalExact,
            };
        })
        .sort((a, b) => b.checks - a.checks);
}
