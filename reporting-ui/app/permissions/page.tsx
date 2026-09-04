"use client";

import { useEffect, useState } from "react";
import { KeyRound, Check } from "lucide-react";
import {
    getRolePermissions,
    setRolePermission,
    buildPermissionMap,
    PAGES,
    ROLES,
    ROLE_LABELS,
    type Role,
} from "@/lib/api/auth";
import { useAuth } from "@/components/auth/AuthContext";

export default function PermissionsPage() {
    const { reloadPermissions } = useAuth();
    const [map, setMap] = useState<Record<string, Record<string, boolean>>>({});
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState<string | null>(null);

    async function load() {
        try {
            const rows = await getRolePermissions();
            setMap(buildPermissionMap(rows));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function toggle(role: Role, pageKey: string) {
        // Super admin is always all-access; don't allow locking them out.
        if (role === "super_admin") return;

        const current = map[role]?.[pageKey] === true;
        const next = !current;
        const cellKey = `${role}:${pageKey}`;

        // Optimistic update.
        setMap((prev) => ({
            ...prev,
            [role]: { ...(prev[role] ?? {}), [pageKey]: next },
        }));
        setSavingKey(cellKey);

        try {
            await setRolePermission(role, pageKey, next);
            await reloadPermissions();
        } catch (err) {
            // Revert on failure.
            setMap((prev) => ({
                ...prev,
                [role]: { ...(prev[role] ?? {}), [pageKey]: current },
            }));
            alert(err instanceof Error ? err.message : "Failed to save.");
        } finally {
            setSavingKey(null);
        }
    }

    function isOn(role: Role, pageKey: string): boolean {
        if (role === "super_admin") return true;
        return map[role]?.[pageKey] === true;
    }

    if (loading) {
        return (
            <div className="min-h-full bg-slate-100 p-8 text-slate-600">
                Loading permissions...
            </div>
        );
    }

    return (
        <div className="min-h-full bg-slate-100 text-slate-900">
            <div className="mx-auto max-w-4xl p-6 lg:p-8">
                <div className="mb-6">
                    <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
                        <KeyRound size={26} /> Permissions
                    </h1>
                    <p className="mt-2 text-sm text-slate-600">
                        Toggle which pages each role can access. Super admins
                        always have full access. Changes apply immediately.
                    </p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-4 py-3 text-left">Page</th>
                                {ROLES.map((r) => (
                                    <th key={r} className="px-4 py-3 text-center">
                                        {ROLE_LABELS[r]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {PAGES.map((page) => (
                                <tr
                                    key={page.key}
                                    className="border-t border-slate-100"
                                >
                                    <td className="px-4 py-2.5 font-medium text-slate-700">
                                        {page.label}
                                    </td>
                                    {ROLES.map((role) => {
                                        const on = isOn(role, page.key);
                                        const locked = role === "super_admin";
                                        const cellKey = `${role}:${page.key}`;
                                        return (
                                            <td
                                                key={role}
                                                className="px-4 py-2.5 text-center"
                                            >
                                                <button
                                                    onClick={() => toggle(role, page.key)}
                                                    disabled={locked || savingKey === cellKey}
                                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition ${
                                                        on
                                                            ? "border-emerald-500 bg-emerald-500 text-white"
                                                            : "border-slate-300 bg-white text-transparent hover:border-slate-400"
                                                    } ${
                                                        locked
                                                            ? "cursor-not-allowed opacity-70"
                                                            : "cursor-pointer"
                                                    }`}
                                                    title={
                                                        locked
                                                            ? "Super admins always have full access"
                                                            : on
                                                              ? "Click to revoke"
                                                              : "Click to grant"
                                                    }
                                                >
                                                    <Check size={14} />
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
