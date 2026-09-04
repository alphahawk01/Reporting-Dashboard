// One-off: generate SQL to create a login account for every existing analyst.
// Username = password = firstnamelastname (lowercased, non-alphanumerics
// stripped). Role = analyst. analyst_name = the real analyst name.
// Password is SHA-256(salt + password) to match lib/api/auth.ts hashPassword.
//
// Usage: node scripts/gen_analyst_accounts.mjs > migrations/seed_analyst_accounts.sql

import { createClient } from "@supabase/supabase-js";
import { webcrypto } from "node:crypto";

const SUPABASE_URL = "https://uizimmfujhpuiqhjofzf.supabase.co";
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpemltbWZ1amhwdWlxaGpvZnpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NzU2MzIsImV4cCI6MjA5NzE1MTYzMn0.kQBVjF5-NAe972IDZuQYrgYmU3njuU-HTI3Wp9pVh54";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function sqlEscape(s) {
    return s.replace(/'/g, "''");
}

// firstnamelastname: lowercase, strip everything that isn't a-z0-9.
function toUsername(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function randomSalt() {
    const bytes = webcrypto.getRandomValues(new Uint8Array(12));
    return (
        "pd_" +
        Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
    );
}

async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(salt + password);
    const digest = await webcrypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

async function main() {
    const names = new Set();
    const add = (raw) => {
        const n = (raw ?? "").trim();
        if (n) names.add(n);
    };

    // Shared analysts table.
    const { data: platform, error: pErr } = await supabase
        .from("analysts")
        .select("name");
    if (pErr) console.error("analysts table:", pErr.message);
    for (const r of platform ?? []) add(r.name);

    // Deputy roster (paged).
    const pageSize = 1000;
    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from("deputy_shifts")
            .select("employee_name")
            .range(from, from + pageSize - 1);
        if (error) {
            console.error("deputy_shifts:", error.message);
            break;
        }
        if (!data || data.length === 0) break;
        for (const r of data) add(r.employee_name);
        from += pageSize;
        if (data.length < pageSize) break;
    }

    // Existing usernames so we don't collide (case-insensitive).
    const { data: existing } = await supabase
        .from("user_accounts")
        .select("username");
    const takenUsernames = new Set(
        (existing ?? []).map((u) => u.username.toLowerCase())
    );

    // Build rows, de-duping usernames (append 2,3,... on collision).
    const sorted = Array.from(names).sort((a, b) => a.localeCompare(b));
    const values = [];
    const usedThisRun = new Set();

    for (const name of sorted) {
        const base = toUsername(name);
        if (!base) continue; // skip names with no alphanumerics

        let username = base;
        let n = 2;
        while (takenUsernames.has(username) || usedThisRun.has(username)) {
            username = `${base}${n++}`;
        }
        usedThisRun.add(username);

        // Password matches the base username (firstnamelastname), even if the
        // stored username got a numeric suffix for uniqueness.
        const password = base;
        const salt = randomSalt();
        const hash = await hashPassword(password, salt);

        values.push(
            `    ('${sqlEscape(username)}', '${hash}', '${salt}', '${sqlEscape(
                name
            )}', 'analyst')`
        );
    }

    console.log(
        "-- Auto-generated: one login per existing analyst.\n" +
            "-- Username = password = firstnamelastname; role = analyst.\n" +
            "-- Duplicates skipped via ON CONFLICT (username unique).\n"
    );
    console.log(
        "insert into public.user_accounts (username, password_hash, salt, analyst_name, role) values"
    );
    console.log(values.join(",\n"));
    console.log("on conflict do nothing;");
    console.error(`Generated ${values.length} analyst accounts.`);
}

main();
