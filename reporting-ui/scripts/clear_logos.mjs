// Clear logo_url for specific teams that were mapped to the wrong club.
// Usage: node scripts/clear_logos.mjs "Team One" "Team Two" ...
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
    "https://uizimmfujhpuiqhjofzf.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpemltbWZ1amhwdWlxaGpvZnpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU3NTYzMiwiZXhwIjoyMDk3MTUxNjMyfQ.kKp06R1o7gYu6EexlkKgFhAYiSSWlNIThfekPjneO38"
);

const names = process.argv.slice(2);
if (names.length === 0) {
    console.error('Pass team names, e.g. node scripts/clear_logos.mjs "Melton South"');
    process.exit(1);
}

const { data, error } = await supabase
    .from("teams")
    .update({ logo_url: null })
    .in("team_name", names)
    .select("team_name");

if (error) console.error("Update failed:", error.message);
else {
    console.log(`Cleared logo_url on ${data.length} row(s):`);
    for (const r of data) console.log("  " + r.team_name);
}
