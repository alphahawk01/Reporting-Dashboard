import { supabase } from "@/lib/supabase";
import DashboardClient from "@/components/DashboardClient";

export default async function Home() {
  const pageSize = 1000;

  // =====================================================
  // DEPUTY DATA
  // =====================================================
  let deputyRows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("deputy_shifts")
      .select("*")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    deputyRows = deputyRows.concat(data);
    from += pageSize;

    if (data.length < pageSize) break;
  }

  console.log("DEPUTY ROW COUNT:", deputyRows.length);

  console.log(
    "DEPUTY HOURS SUM:",
    deputyRows.reduce(
      (sum, r) => sum + Number(r.total_hours || 0),
      0
    )
  );

  // =====================================================
  // TT DATA
  // =====================================================
  let ttRows: any[] = [];
  let ttFrom = 0;

  while (true) {
    const { data, error } = await supabase
      .from("TT_Games")
      .select("*")
      .range(ttFrom, ttFrom + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    ttRows = ttRows.concat(data);
    ttFrom += pageSize;

    if (data.length < pageSize) break;
  }

  console.log("TT ROW COUNT:", ttRows.length);

  // =====================================================
  // SAFE PASS TO CLIENT
  // =====================================================
  return (
    <DashboardClient
      deputyData={deputyRows ?? []}
      ttData={ttRows ?? []}
    />
  );
}