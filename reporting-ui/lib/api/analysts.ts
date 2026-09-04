import { supabase } from "@/lib/supabase";

const API_URL =
    process.env.NODE_ENV === "development"
        ? "http://localhost:5165"
        : "https://downloads.premierdata-technology.com";


export interface AutoDownloadAnalyst {
    id: number;
    name: string;

    homeComputer: {
        id: number;
        computerName: string;
    } | null;

    officeComputer: {
        id: number;
        computerName: string;
    } | null;
}


export interface Analyst {
    id: number;
    name: string;
    email?: string | null;

    homeComputer: {
        id: number;
        computerName: string;
    } | null;

    officeComputer: {
        id: number;
        computerName: string;
    } | null;
}


export async function getAutoDownloadAnalysts(): Promise<
    AutoDownloadAnalyst[]
> {

    const res = await fetch(
        `${API_URL}/api/analysts`,
        {
            cache: "no-store",
        }
    );

    if (!res.ok) {
        throw new Error(
            "Failed loading AutoDownload analysts"
        );
    }

    return res.json();
}


export async function getAnalysts(): Promise<
    Analyst[]
> {

    const res = await fetch(
        `${API_URL}/api/analysts`,
        {
            cache: "no-store",
        }
    );

    if (!res.ok) {
        throw new Error(
            "Failed loading analysts"
        );
    }

    return res.json();
}


export async function deleteAnalyst(
    id: number
) {

    const res = await fetch(
        `${API_URL}/api/analysts/${id}`,
        {
            method: "DELETE",
        }
    );

    if (!res.ok) {

        const errorText =
            await res.text();

        throw new Error(
            `Failed deleting analyst (${res.status}): ${errorText}`
        );

    }

    return true;
}


export async function renameAnalyst(
    id: number,
    firstName?: string,
    lastName?: string
): Promise<{ id: number; name: string; firstName: string; lastName: string }> {

    const res = await fetch(
        `${API_URL}/api/analysts/${id}/name`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...(firstName ? { firstName } : {}),
                ...(lastName ? { lastName } : {}),
            }),
        }
    );

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
            `Failed renaming analyst (${res.status}): ${errorText}`
        );
    }

    return res.json();
}
export async function updateHomeComputer(
    analystId: number,
    computerId: number | null,
    force = false
) {

    const id = computerId ?? 0;

    const res = await fetch(
        `${API_URL}/api/analysts/${analystId}/home-computer/${id}?force=${force}`,
        {
            method: "PUT",
        }
    );

    if (!res.ok) {

        const errorText =
            await res.text();

        let errorData: any;

        try {
            errorData =
                JSON.parse(errorText);
        }
        catch {
            errorData = {
                message:
                    "Failed to update Home Computer",
            };
        }

        const error =
            new Error(
                errorData.message ||
                "Failed to update Home Computer"
            );

        Object.assign(
            error,
            errorData
        );

        throw error;
    }

    return res.json().catch(() => null);
}


export async function updateOfficeComputer(
    analystId: number,
    computerId: number | null,
    force = false
) {

    const id = computerId ?? 0;

    const res = await fetch(
        `${API_URL}/api/analysts/${analystId}/office-computer/${id}?force=${force}`,
        {
            method: "PUT",
        }
    );

    if (!res.ok) {

        const errorText =
            await res.text();

        let errorData: any;

        try {
            errorData =
                JSON.parse(errorText);
        }
        catch {
            errorData = {
                message:
                    "Failed to update Office Computer",
            };
        }

        const error =
            new Error(
                errorData.message ||
                "Failed to update Office Computer"
            );

        Object.assign(
            error,
            errorData
        );

        throw error;
    }

    return res.json().catch(() => null);
}


// ======================================================================
// PLATFORM ANALYSTS (Supabase `analysts` table)
//
// A shared source of truth for analyst identity across the Supabase-backed
// parts of the app. Analysts added here appear in the Accuracy Comparison
// dropdowns and are merged into the Analyst Management view. Matching is by
// name (no shared id with the .NET analysts API), so names are stored
// trimmed and de-duplicated case-insensitively.
// ======================================================================

export interface PlatformAnalyst {
    id: number;
    name: string;
    email: string | null;
    created_at: string;
}

/** A single entry to add (name required, email optional). */
export interface NewAnalystEntry {
    name: string;
    email?: string | null;
}

/** Result of a bulk add: how many were inserted vs skipped as duplicates. */
export interface BulkAddResult {
    added: number;
    skipped: number;
    addedNames: string[];
}

/**
 * All analysts recorded in the shared Supabase `analysts` table, name-sorted.
 */
export async function getPlatformAnalysts(): Promise<PlatformAnalyst[]> {
    const { data, error } = await supabase
        .from("analysts")
        .select("id, name, email, created_at")
        .order("name", { ascending: true });

    if (error) {
        console.error("Failed loading platform analysts:", error);
        throw new Error(error.message || "Failed loading analysts");
    }

    return (data ?? []) as PlatformAnalyst[];
}

/**
 * Add a single analyst. Throws on a duplicate name (case-insensitive unique
 * index) or other DB error.
 */
export async function createAnalyst(
    name: string,
    email?: string | null
): Promise<PlatformAnalyst> {
    const clean = name.trim();
    if (!clean) throw new Error("Analyst name is required.");

    const { data, error } = await supabase
        .from("analysts")
        .insert({ name: clean, email: email?.trim() || null })
        .select("id, name, email, created_at")
        .single();

    if (error) {
        // Postgres unique-violation code.
        if (error.code === "23505") {
            throw new Error(`"${clean}" already exists.`);
        }
        console.error("Failed creating analyst:", error);
        throw new Error(error.message || "Failed creating analyst");
    }

    return data as PlatformAnalyst;
}

/**
 * Add many analysts at once, skipping any whose name already exists (either
 * already in the table, or duplicated within the input). De-duplication is
 * case-insensitive.
 */
export async function createAnalystsBulk(
    entries: NewAnalystEntry[]
): Promise<BulkAddResult> {
    // Normalise + de-dupe the input by lowercased name (first email wins).
    const byLower = new Map<string, NewAnalystEntry>();
    for (const e of entries) {
        const name = e.name.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (!byLower.has(key)) {
            byLower.set(key, { name, email: e.email?.trim() || null });
        }
    }

    const requested = Array.from(byLower.values());
    if (requested.length === 0) {
        return { added: 0, skipped: 0, addedNames: [] };
    }

    // Skip names that already exist in the table (case-insensitive).
    const existing = await getPlatformAnalysts();
    const existingLower = new Set(
        existing.map((a) => a.name.trim().toLowerCase())
    );

    const toInsert = requested.filter(
        (e) => !existingLower.has(e.name.toLowerCase())
    );
    const skipped = requested.length - toInsert.length;

    if (toInsert.length === 0) {
        return { added: 0, skipped, addedNames: [] };
    }

    const { data, error } = await supabase
        .from("analysts")
        .insert(
            toInsert.map((e) => ({ name: e.name, email: e.email ?? null }))
        )
        .select("name");

    if (error) {
        console.error("Failed bulk-adding analysts:", error);
        throw new Error(error.message || "Failed bulk-adding analysts");
    }

    const addedNames = (data ?? []).map((r) => (r as { name: string }).name);
    return { added: addedNames.length, skipped, addedNames };
}

/**
 * Distinct analyst names for pickers. Unions the shared `analysts` table with
 * the Deputy roster (deputy_shifts.employee_name) so both manually-added
 * analysts and rostered staff appear. Case-insensitively de-duplicated,
 * name-sorted.
 */
export async function getPlatformAnalystNames(): Promise<string[]> {
    const seenLower = new Set<string>();
    const names: string[] = [];

    const add = (raw?: string | null) => {
        const n = raw?.trim();
        if (!n) return;
        const key = n.toLowerCase();
        if (seenLower.has(key)) return;
        seenLower.add(key);
        names.push(n);
    };

    // Shared analysts table.
    try {
        const platform = await getPlatformAnalysts();
        for (const a of platform) add(a.name);
    } catch (err) {
        console.error("getPlatformAnalystNames: analysts table failed", err);
    }

    // Deputy roster (paged).
    const pageSize = 1000;
    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from("deputy_shifts")
            .select("employee_name")
            .range(from, from + pageSize - 1);

        if (error) {
            console.error("getPlatformAnalystNames: deputy_shifts failed", error);
            break;
        }
        if (!data || data.length === 0) break;
        for (const r of data) add((r as { employee_name?: string }).employee_name);
        from += pageSize;
        if (data.length < pageSize) break;
    }

    return names.sort((a, b) => a.localeCompare(b));
}
