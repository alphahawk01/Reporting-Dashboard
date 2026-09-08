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
 * A saved check without the heavy raw-XML blobs. Use this for list/summary
 * views (leaderboards, dispute lists) that never re-parse the source XML —
 * it avoids pulling potentially megabytes of xml_master/xml_analyst per row
 * into the browser.
 */
export type AccuracyCheckMeta = Omit<AccuracyCheck, "xml_master" | "xml_analyst">;

// Every AccuracyCheck column except the two XML blobs, for projected selects.
const ACCURACY_CHECK_META_COLUMNS =
    "id, created_at, analyst_name, master_analyst_name, match_label, " +
    "file_name_master, file_name_analyst, tolerance, accuracy, master_total, " +
    "analyst_total, exact, wrong_stat, wrong_player, wrong_team, missed, extra, " +
    "avg_time_drift, category_breakdown, team_breakdown, video_url, sport";

/**
 * Like getAllAccuracyChecks but WITHOUT the xml_master/xml_analyst blobs.
 * Much lighter over the wire; use when the caller only needs the summary
 * fields (accuracy, breakdowns, sport, labels) and never re-parses XML.
 */
export async function getAccuracyChecksMeta(): Promise<AccuracyCheckMeta[]> {
    const rows: AccuracyCheckMeta[] = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from("accuracy_checks")
            .select(ACCURACY_CHECK_META_COLUMNS)
            .order("created_at", { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) {
            console.error("Failed loading accuracy check meta:", error);
            throw new Error(error.message || "Failed loading accuracy checks");
        }

        if (!data || data.length === 0) break;
        rows.push(...(data as unknown as AccuracyCheckMeta[]));
        from += pageSize;
        if (data.length < pageSize) break;
    }

    return rows;
}

/** Just the raw XML blobs for one check (for on-demand parsing). */
export interface AccuracyCheckXml {
    id: number;
    xml_master: string | null;
    xml_analyst: string | null;
}

/**
 * Fetch the xml_master/xml_analyst blobs for a specific set of check ids,
 * in small batches. Used for on-demand work (e.g. Home/Away category
 * breakdowns) so the main list load never has to pull every check's XML at
 * once — which is large enough to hit Postgres statement timeouts.
 */
export async function getAccuracyChecksXml(
    ids: number[]
): Promise<Map<number, AccuracyCheckXml>> {
    const out = new Map<number, AccuracyCheckXml>();
    const unique = Array.from(new Set(ids));
    const batchSize = 25; // keep each query small so it never times out

    for (let i = 0; i < unique.length; i += batchSize) {
        const batch = unique.slice(i, i + batchSize);
        const { data, error } = await supabase
            .from("accuracy_checks")
            .select("id, xml_master, xml_analyst")
            .in("id", batch);

        if (error) {
            console.error("Failed loading accuracy check XML:", error);
            throw new Error(error.message || "Failed loading check XML");
        }
        for (const row of (data ?? []) as AccuracyCheckXml[]) {
            out.set(row.id, row);
        }
    }

    return out;
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
    checks: AccuracyCheckMeta[]
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
    /** Average of per-check Home accuracy (null if no check has Home data). */
    avgHomeAccuracy: number | null;
    /** Average of per-check Away accuracy (null if no check has Away data). */
    avgAwayAccuracy: number | null;
}

/**
 * Read a canonical team's accuracy ("home" / "away") off a check's stored
 * team_breakdown. Teams are canonicalised to Home/Away at comparison time.
 */
function teamAccuracy(
    check: AccuracyCheckMeta,
    team: "home" | "away"
): number | null {
    const t = check.team_breakdown?.find(
        (b) => b.team.trim().toLowerCase() === team && b.masterTotal > 0
    );
    return t ? t.accuracy : null;
}

/**
 * Per-graded-analyst rollup across all their checks.
 */
export function summariseByAnalyst(
    checks: AccuracyCheckMeta[]
): AnalystAccuracySummary[] {
    const map = new Map<string, AccuracyCheckMeta[]>();

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

            const avg = (vals: number[]) =>
                vals.length > 0
                    ? vals.reduce((sum, v) => sum + v, 0) / vals.length
                    : null;
            const homeVals = list
                .map((c) => teamAccuracy(c, "home"))
                .filter((v): v is number => v != null);
            const awayVals = list
                .map((c) => teamAccuracy(c, "away"))
                .filter((v): v is number => v != null);

            return {
                analystName,
                checks: list.length,
                avgAccuracy:
                    list.reduce((sum, c) => sum + c.accuracy, 0) / list.length,
                latestAccuracy: sorted[0]?.accuracy ?? 0,
                totalMaster,
                totalExact,
                avgHomeAccuracy: avg(homeVals),
                avgAwayAccuracy: avg(awayVals),
            };
        })
        .sort((a, b) => b.checks - a.checks);
}
