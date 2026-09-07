// One-off: backfill accuracy_checks.sport by inferring the sport from each
// check's stored master XML. Runs a simple keyword scan on the raw XML text
// (no DOM needed), mirroring detectSportFromInstances in xml-compare.ts.
//
// Usage: node scripts/backfill_check_sport.mjs           (dry run)
//        node scripts/backfill_check_sport.mjs --write    (apply updates)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://uizimmfujhpuiqhjofzf.supabase.co";
// Service key (from .env SUPABASE_SERVICE_KEY) — needed to update rows.
const SERVICE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpemltbWZ1amhwdWlxaGpvZnpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU3NTYzMiwiZXhwIjoyMDk3MTUxNjMyfQ.kKp06R1o7gYu6EexlkKgFhAYiSSWlNIThfekPjneO38";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const AFL_KEYWORDS = [
    "handball", "hit out", "hitout", "mark", "behind", "centre bounce",
    "center bounce", "ball up", "hard ball", "loose ball", "spoil", "i50",
    "inside 50", "clanger",
];
const FOOTBALL_KEYWORDS = [
    "pass", "cross", "dribble", "through ball", "goal kick", "throw in",
    "corner", "offside", "aerial", "ground duel", "clearance", "interception",
    "ball recover", "header", "keeper",
];

function detectSport(xml) {
    if (!xml) return null;
    const s = xml.toLowerCase();
    let afl = 0;
    let football = 0;
    for (const k of AFL_KEYWORDS) {
        let idx = s.indexOf(k);
        while (idx !== -1) {
            afl++;
            idx = s.indexOf(k, idx + k.length);
        }
    }
    for (const k of FOOTBALL_KEYWORDS) {
        let idx = s.indexOf(k);
        while (idx !== -1) {
            football++;
            idx = s.indexOf(k, idx + k.length);
        }
    }
    if (afl === 0 && football === 0) return null;
    return football > afl ? "football" : "afl";
}

const WRITE = process.argv.includes("--write");

const { data, error } = await supabase
    .from("accuracy_checks")
    .select("id, sport, file_name_master, xml_master, xml_analyst");

if (error) {
    console.error("Failed loading checks:", error.message);
    process.exit(1);
}

let updated = 0;
let skipped = 0;
for (const c of data ?? []) {
    const inferred =
        detectSport(c.xml_master) ?? detectSport(c.xml_analyst);
    if (!inferred) {
        console.log(`#${c.id} — could not infer (no XML signal), leaving as ${JSON.stringify(c.sport)}`);
        skipped++;
        continue;
    }
    if (c.sport === inferred) {
        skipped++;
        continue;
    }
    console.log(
        `#${c.id} ${JSON.stringify(c.sport)} -> ${inferred}  (${c.file_name_master ?? "?"})`
    );
    if (WRITE) {
        const { error: uErr } = await supabase
            .from("accuracy_checks")
            .update({ sport: inferred })
            .eq("id", c.id);
        if (uErr) console.error(`  failed: ${uErr.message}`);
        else updated++;
    }
}

console.log(
    `\n${WRITE ? "Updated" : "Would update"} ${WRITE ? updated : data.filter((c) => {
        const inf = detectSport(c.xml_master) ?? detectSport(c.xml_analyst);
        return inf && inf !== c.sport;
    }).length} check(s). Skipped ${skipped}.`
);
if (!WRITE) console.log("Dry run — re-run with --write to apply.");
