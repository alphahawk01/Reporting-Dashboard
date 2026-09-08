// One-time migration: move the static clubLogos.ts entries into the Supabase
// `teams` table so the DB is the single source of truth for club logos.
//
// The static keys are club BASE names (e.g. "strathmore"). We insert them as
// team_name rows so the resolver's suffix-aware retry ("Strathmore U18s" ->
// "strathmore") keeps working.
//
// Usage:
//   node scripts/migrate_clublogos_to_db.mjs            (dry run)
//   node scripts/migrate_clublogos_to_db.mjs --write     (upsert into `teams`)

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://uizimmfujhpuiqhjofzf.supabase.co";
const SERVICE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpemltbWZ1amhwdWlxaGpvZnpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU3NTYzMiwiZXhwIjoyMDk3MTUxNjMyfQ.kKp06R1o7gYu6EexlkKgFhAYiSSWlNIThfekPjneO38";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const WRITE = process.argv.includes("--write");

// --- Parse clubLogos.ts (no TS import needed; extract "key": "url" pairs) ---
const src = readFileSync("app/analyst-profile/clubLogos.ts", "utf8");
const entries = [];
const re = /"([^"]+)"\s*:\s*"([^"]+)"/g;
let m;
while ((m = re.exec(src)) !== null) {
    const key = m[1].trim();
    const url = m[2].trim();
    // Skip anything that isn't a logo URL (defensive).
    if (!/^https?:\/\//.test(url)) continue;
    entries.push({ team_name: key, logo_url: url });
}

if (entries.length === 0) {
    console.error("No entries parsed from clubLogos.ts — aborting.");
    process.exit(1);
}

console.log(`Parsed ${entries.length} entries from clubLogos.ts.\n`);
for (const e of entries) console.log(`  ${e.team_name}`);

if (WRITE) {
    const { error } = await supabase
        .from("teams")
        .upsert(entries, { onConflict: "team_name" });
    if (error) console.error("\nUpsert failed:", error.message);
    else console.log(`\nWrote ${entries.length} club logos to teams.`);
} else {
    console.log("\nDry run — re-run with --write to save these into the DB.");
}
