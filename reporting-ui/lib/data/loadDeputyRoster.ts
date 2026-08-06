import type { DeputyRosterShift } from "@/types/deputyRoster";

export async function loadDeputyRoster(): Promise<DeputyRosterShift[]> {
    const response = await fetch("/data/deputy-roster.csv");

    const text = await response.text();

    // We'll parse this next
    return [];
}