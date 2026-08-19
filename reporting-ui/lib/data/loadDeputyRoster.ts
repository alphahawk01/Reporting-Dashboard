import { supabase } from "@/lib/supabase";
import type { DeputyRoster } from "@/types/deputyRoster";

export async function loadDeputyRoster(): Promise<DeputyRoster[]> {

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
        );


    if (error) {

        console.error(
            "Failed loading Deputy roster:",
            error
        );

        throw new Error(
            "Failed loading Deputy roster"
        );

    }


    return (
        data ?? []
    ) as DeputyRoster[];

}