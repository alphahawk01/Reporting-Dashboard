"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthContext";
import { pageKeyForPath } from "@/lib/api/auth";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/Topbar";

// Pages that render without the app chrome / auth guard.
const PUBLIC_PATHS = ["/login"];

export default function AppShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, ready, hasAccess, firstAccessiblePath } = useAuth();

    const isPublic = PUBLIC_PATHS.includes(pathname);
    const pageKey = pageKeyForPath(pathname);
    // Root "/" mirrors the dashboard.
    const effectiveKey = pathname === "/" ? "dashboard" : pageKey;
    const allowed = isPublic || hasAccess(effectiveKey);
    // Where an unauthorised (but logged-in) user should land.
    const fallback = firstAccessiblePath();

    useEffect(() => {
        if (!ready || isPublic) return;

        // Not logged in → login.
        if (!user) {
            router.replace("/login");
            return;
        }

        // Logged in and allowed here → nothing to do.
        if (hasAccess(effectiveKey)) return;

        // No access to this page. Send to the first page they CAN access.
        // Only redirect if that's a different path, so we never loop when
        // the user has no accessible pages at all.
        if (fallback && fallback !== pathname) {
            router.replace(fallback);
        }
    }, [ready, isPublic, user, effectiveKey, hasAccess, fallback, pathname, router]);

    // Public pages (login) render bare.
    if (isPublic) {
        return <>{children}</>;
    }

    // Restoring session / redirecting an unauthenticated user.
    if (!ready || !user) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
                Loading...
            </div>
        );
    }

    // Logged in but this account has no accessible pages at all — show a
    // clear message instead of bouncing between redirects.
    if (!allowed && !fallback) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-slate-300">
                <p className="text-lg font-semibold">No pages available</p>
                <p className="max-w-sm text-sm text-slate-400">
                    Your account doesn&apos;t have access to any pages yet. Ask
                    a super admin to grant permissions for your role.
                </p>
            </div>
        );
    }

    // Not allowed here but a redirect to an accessible page is in flight.
    if (!allowed) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
                Loading...
            </div>
        );
    }

    return (
        <div className="flex h-full">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
                <TopBar />
                <main className="flex-1 overflow-auto">{children}</main>
            </div>
        </div>
    );
}
