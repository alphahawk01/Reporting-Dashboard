import type { Role } from "@/lib/api/auth";

// ======================================================================
// LMS provisioning (option 2a). When a dashboard account is created with an
// email, we invite the same person into the training LMS so their LMS account
// is auto-provisioned. This calls the LMS's shared-secret endpoint
// (POST /api/provision) from the browser.
//
// NOTE (security): this is a client-only static app, so the shared secret ships
// in the bundle. The blast radius is limited — the endpoint can only send LMS
// invites (unconfirmed, passwordless accounts) and assign learner/admin roles.
// This is an internal ops tool; treat the secret as low-value. For a hardened
// setup, route provisioning through a trusted server instead (option 2b).
// ======================================================================

const LMS_URL =
    process.env.NEXT_PUBLIC_LMS_URL ??
    "https://training.premierdata-technology.com";

// The shared secret must match PROVISION_SHARED_SECRET on the LMS.
const PROVISION_SECRET = process.env.NEXT_PUBLIC_LMS_PROVISION_SECRET ?? "";

export type ProvisionResult =
    | { ok: true; status: "invited" | "exists"; warning?: string }
    | { ok: false; error: string };

/**
 * Provision (invite) a user into the LMS by email. Best-effort: callers should
 * NOT block dashboard account creation on the result — surface a warning if it
 * fails. Returns { ok:false } (never throws) so the caller stays simple.
 */
export async function provisionLmsUser(input: {
    email: string;
    fullName?: string | null;
    role: Role;
}): Promise<ProvisionResult> {
    const email = input.email.trim();
    if (!email) return { ok: false, error: "No email provided." };
    if (!PROVISION_SECRET) {
        return {
            ok: false,
            error: "LMS provisioning is not configured (missing secret).",
        };
    }

    try {
        const res = await fetch(`${LMS_URL}/api/provision`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-provision-secret": PROVISION_SECRET,
            },
            body: JSON.stringify({
                email,
                full_name: input.fullName?.trim() || "",
                role: input.role,
            }),
        });

        const data = (await res.json().catch(() => ({}))) as {
            status?: "invited" | "exists";
            warning?: string;
            error?: string;
        };

        if (!res.ok) {
            return { ok: false, error: data.error || `LMS returned ${res.status}` };
        }
        return {
            ok: true,
            status: data.status ?? "invited",
            warning: data.warning,
        };
    } catch (err) {
        return {
            ok: false,
            error:
                err instanceof Error
                    ? err.message
                    : "Could not reach the LMS.",
        };
    }
}
