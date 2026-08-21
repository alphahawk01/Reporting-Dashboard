import { supabase } from "@/lib/supabase";
import type { DeputyRoster } from "@/types/deputyRoster";

const PAGE_SIZE = 1000;

type LoadDeputyRosterOptions = {
    /** Inclusive start date (YYYY-MM-DD) to filter shift_date by. */
    startDate?: string;
    /** Inclusive end date (YYYY-MM-DD) to filter shift_date by. */
    endDate?: string;
};

/**
 * Loads deputy_roster rows.
 *
 * When startDate/endDate are provided, only rows within that date
 * range are fetched — this is the preferred way to call this function
 * (e.g. one calendar week at a time) since deputy_roster now holds
 * 2000+ rows and a single week's worth is well under Supabase's
 * 1000-row cap, so no pagination round-trips are needed and far less
 * data is transferred.
 *
 * When called with no range, every row is paginated through with
 * .range() so nothing is silently dropped — Supabase caps an
 * unpaginated select("*") at 1000 rows, and a plain select would
 * otherwise return only the oldest 1000 rows (ordered ascending by
 * shift_date), missing recent weeks entirely.
 */
export async function loadDeputyRoster(
    options: LoadDeputyRosterOptions = {}
): Promise<DeputyRoster[]> {

    const { startDate, endDate } = options;

    let from = 0;
    let all: DeputyRoster[] = [];

    while (true) {

        let query = supabase
            .from("deputy_roster")
            .select("*")
            .order(
                "shift_date",
                {
                    ascending: true,
                }
            );

        if (startDate) {
            query = query.gte("shift_date", startDate);
        }

        if (endDate) {
            query = query.lte("shift_date", endDate);
        }

        const {
            data,
            error,
        } = await query.range(from, from + PAGE_SIZE - 1);

        if (error) {

            console.error(
                "Failed loading Deputy roster:",
                error
            );

            throw new Error(
                "Failed loading Deputy roster"
            );

        }

        if (!data || data.length === 0) break;

        all = all.concat(data as DeputyRoster[]);

        if (data.length < PAGE_SIZE) break;

        from += PAGE_SIZE;

    }

    return all;

}