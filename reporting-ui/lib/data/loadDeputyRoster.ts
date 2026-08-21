import { supabase } from "@/lib/supabase";
import type { DeputyRoster } from "@/types/deputyRoster";

const PAGE_SIZE = 1000;

export async function loadDeputyRoster(): Promise<DeputyRoster[]> {

    // Supabase caps an unpaginated select at 1000 rows. deputy_roster
    // now holds 2000+ rows, so a single select("*") silently returns
    // only the oldest 1000 rows (ordered ascending by shift_date) and
    // misses the current week entirely. Page through with .range()
    // like every other large-table read in this app (leaderboard,
    // analyst-profile, analyst-compare, fixtures, schedule's TT_Games
    // load) to make sure every row — including this week's — loads.
    let from = 0;
    let all: DeputyRoster[] = [];

    while (true) {

        const {
            data,
            error,
        } = await supabase
            .from("deputy_roster")
            .select("*")
            .order(
                "shift_date",
                {
                    ascending: true,
                }
            )
            .range(from, from + PAGE_SIZE - 1);

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