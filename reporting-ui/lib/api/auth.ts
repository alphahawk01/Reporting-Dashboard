import { supabase } from "@/lib/supabase";

// ======================================================================
// Simple username/password auth (UI-level only, no Supabase Auth).
// Passwords are SHA-256(salt + password) hashed. Not high-security; a
// lightweight gate to get role-based access running.
// ======================================================================

export type Role = "analyst" | "admin" | "super_admin";

export const ROLES: Role[] = ["analyst", "admin", "super_admin"];

export const ROLE_LABELS: Record<Role, string> = {
    analyst: "Analyst",
    admin: "Admin",
    super_admin: "Super Admin",
};

export interface UserAccount {
    id: number;
    created_at: string;
    username: string;
    analyst_name: string | null;
    role: Role;
}

// A row as stored (includes the hash/salt we never expose to the UI).
interface UserAccountRow extends UserAccount {
    password_hash: string;
    salt: string;
}

export interface RolePermission {
    role: Role;
    page_key: string;
    can_access: boolean;
}

// ----------------------------------------------------------------------
// Page registry — the pages the permission matrix can toggle. Keys match
// the seeded role_permissions.page_key values and (mostly) the route path.
// ----------------------------------------------------------------------
export interface PageDef {
    key: string;
    label: string;
    /** route path (for guard matching); omitted for virtual keys */
    href?: string;
}

export const PAGES: PageDef[] = [
    { key: "dashboard", label: "Dashboard", href: "/dashboard" },
    { key: "operations", label: "Live Board", href: "/operations" },
    { key: "computers", label: "Computers", href: "/computers" },
    { key: "downloads", label: "Downloads", href: "/downloads" },
    { key: "notifications", label: "Notifications", href: "/notifications" },
    { key: "fixtures", label: "Fixtures", href: "/fixtures" },
    { key: "competitions", label: "Competitions", href: "/competitions" },
    { key: "schedule", label: "Schedule", href: "/schedule" },
    { key: "recommendations", label: "AI Recommendations", href: "/recommendations" },
    { key: "analyst-management", label: "Analyst Management", href: "/analyst-management" },
    { key: "analyst-profile", label: "Analyst Profiles", href: "/analyst-profile" },
    { key: "affiliated-teams", label: "Affiliated Teams", href: "/affiliated-teams" },
    { key: "reporting", label: "Reporting", href: "/reporting" },
    { key: "leaderboard", label: "Leaderboard", href: "/leaderboard" },
    { key: "analyst-compare", label: "Analyst Comparison", href: "/analyst-compare" },
    { key: "accuracy-compare", label: "Accuracy Comparison", href: "/accuracy-compare" },
    { key: "accuracy-checks", label: "Accuracy History", href: "/accuracy-checks" },
    { key: "settings", label: "Settings", href: "/settings" },
    { key: "users", label: "User Accounts", href: "/users" },
    { key: "permissions", label: "Permissions", href: "/permissions" },
];

/** Map a route pathname to its page key, or null if unknown. */
export function pageKeyForPath(pathname: string): string | null {
    // Longest href match wins (all hrefs are single-segment here).
    const seg = "/" + (pathname.split("/").filter(Boolean)[0] ?? "");
    const hit = PAGES.find((p) => p.href === seg);
    return hit?.key ?? null;
}

// ----------------------------------------------------------------------
// Password hashing (Web Crypto). SHA-256(salt + password) -> hex.
// ----------------------------------------------------------------------
export async function hashPassword(
    password: string,
    salt: string
): Promise<string> {
    const enc = new TextEncoder();
    const data = enc.encode(salt + password);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function randomSalt(): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return (
        "pd_" +
        Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
    );
}

// ----------------------------------------------------------------------
// Auth
// ----------------------------------------------------------------------

/** Verify username + password; returns the account (sans secrets) or null. */
export async function login(
    username: string,
    password: string
): Promise<UserAccount | null> {
    const uname = username.trim();
    if (!uname) return null;

    const { data, error } = await supabase
        .from("user_accounts")
        .select("*")
        .ilike("username", uname)
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("Login lookup failed:", error);
        throw new Error(error.message || "Login failed");
    }
    if (!data) return null;

    const row = data as UserAccountRow;
    const hash = await hashPassword(password, row.salt);
    if (hash !== row.password_hash) return null;

    return {
        id: row.id,
        created_at: row.created_at,
        username: row.username,
        analyst_name: row.analyst_name,
        role: row.role,
    };
}

// ----------------------------------------------------------------------
// Account management (super-admin)
// ----------------------------------------------------------------------

export async function listUsers(): Promise<UserAccount[]> {
    const { data, error } = await supabase
        .from("user_accounts")
        .select("id, created_at, username, analyst_name, role")
        .order("username", { ascending: true });

    if (error) {
        console.error("Failed listing users:", error);
        throw new Error(error.message || "Failed listing users");
    }
    return (data ?? []) as UserAccount[];
}

export async function createUser(input: {
    username: string;
    password: string;
    analystName?: string | null;
    role: Role;
}): Promise<UserAccount> {
    const username = input.username.trim();
    if (!username) throw new Error("Username is required.");
    if (!input.password) throw new Error("Password is required.");

    const salt = randomSalt();
    const password_hash = await hashPassword(input.password, salt);

    const { data, error } = await supabase
        .from("user_accounts")
        .insert({
            username,
            password_hash,
            salt,
            analyst_name: input.analystName?.trim() || null,
            role: input.role,
        })
        .select("id, created_at, username, analyst_name, role")
        .single();

    if (error) {
        if (error.code === "23505") {
            throw new Error(`Username "${username}" already exists.`);
        }
        console.error("Failed creating user:", error);
        throw new Error(error.message || "Failed creating user");
    }
    return data as UserAccount;
}

export async function updateUserRole(id: number, role: Role): Promise<void> {
    const { error } = await supabase
        .from("user_accounts")
        .update({ role })
        .eq("id", id);
    if (error) {
        console.error("Failed updating role:", error);
        throw new Error(error.message || "Failed updating role");
    }
}

export async function resetUserPassword(
    id: number,
    newPassword: string
): Promise<void> {
    if (!newPassword) throw new Error("New password is required.");
    const salt = randomSalt();
    const password_hash = await hashPassword(newPassword, salt);
    const { error } = await supabase
        .from("user_accounts")
        .update({ password_hash, salt })
        .eq("id", id);
    if (error) {
        console.error("Failed resetting password:", error);
        throw new Error(error.message || "Failed resetting password");
    }
}

export async function deleteUser(id: number): Promise<void> {
    const { error } = await supabase
        .from("user_accounts")
        .delete()
        .eq("id", id);
    if (error) {
        console.error("Failed deleting user:", error);
        throw new Error(error.message || "Failed deleting user");
    }
}

// ----------------------------------------------------------------------
// Role permissions matrix
// ----------------------------------------------------------------------

export async function getRolePermissions(): Promise<RolePermission[]> {
    const { data, error } = await supabase
        .from("role_permissions")
        .select("role, page_key, can_access");
    if (error) {
        console.error("Failed loading role permissions:", error);
        throw new Error(error.message || "Failed loading permissions");
    }
    return (data ?? []) as RolePermission[];
}

export async function setRolePermission(
    role: Role,
    pageKey: string,
    canAccess: boolean
): Promise<void> {
    const { error } = await supabase
        .from("role_permissions")
        .upsert(
            { role, page_key: pageKey, can_access: canAccess },
            { onConflict: "role,page_key" }
        );
    if (error) {
        console.error("Failed setting permission:", error);
        throw new Error(error.message || "Failed setting permission");
    }
}

/** Build a nested lookup: permissions[role][pageKey] = boolean. */
export function buildPermissionMap(
    rows: RolePermission[]
): Record<string, Record<string, boolean>> {
    const map: Record<string, Record<string, boolean>> = {};
    for (const r of rows) {
        (map[r.role] ??= {})[r.page_key] = r.can_access;
    }
    return map;
}
