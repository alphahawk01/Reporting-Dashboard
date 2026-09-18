import { supabase } from "@/lib/supabase";

// The AWS usage-type → category mapping lives in Supabase (table
// `aws_cost_categories`) so it can be maintained as data, without code changes.
// The AWS dashboard matches each usage-type COLUMN HEADER from the CSV against
// this mapping to attach a category. See migrations/create_aws_cost_categories.sql.

export interface AwsCostCategoryRow {
  id: number;
  usage_type: string; // exact CSV header incl. trailing "($)"
  category: string | null; // null / "" => uncategorised
}

/**
 * Load the usage-type → category mapping as a plain object keyed by the exact
 * usage-type header. Rows with an empty/blank category are omitted (they'd be
 * treated as uncategorised anyway). Returns an empty object on error so the
 * dashboard can fall back to its built-in mapping and still render.
 */
export async function getAwsCostCategories(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("aws_cost_categories")
    .select("usage_type, category");

  if (error) {
    console.error("Failed loading AWS cost categories:", error);
    return {};
  }

  const map: Record<string, string> = {};
  for (const row of (data ?? []) as Pick<
    AwsCostCategoryRow,
    "usage_type" | "category"
  >[]) {
    const key = (row.usage_type ?? "").trim();
    const cat = (row.category ?? "").trim();
    if (key && cat) map[key] = cat;
  }
  return map;
}
