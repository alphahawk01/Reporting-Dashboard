"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogIn, Lock, User } from "lucide-react";
import { useAuth } from "@/components/auth/AuthContext";

export default function LoginPage() {
    const router = useRouter();
    const { user, ready, login, firstAccessiblePath } = useAuth();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Already logged in → go to the first page this account can access.
    useEffect(() => {
        if (ready && user) {
            router.replace(firstAccessiblePath() ?? "/dashboard");
        }
    }, [ready, user, router, firstAccessiblePath]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            const ok = await login(username, password);
            if (ok) {
                // Land on the first page the account can access. The effect
                // above also handles this once `user` updates.
                router.replace(firstAccessiblePath() ?? "/dashboard");
            } else {
                setError("Incorrect username or password.");
            }
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Login failed. Try again."
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#0B1220] p-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#101826] p-8 shadow-2xl">
                <div className="mb-6 flex flex-col items-center">
                    <Image
                        src="/Premier Data_Logo.png"
                        alt="Premier Data logo"
                        width={543}
                        height={242}
                        priority
                        className="mb-4 h-auto w-full max-w-[200px] object-contain"
                    />
                    <p className="text-sm text-slate-400">Operations Platform</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-400">
                            Username
                        </label>
                        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3">
                            <User size={16} className="text-slate-500" />
                            <input
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoFocus
                                autoComplete="username"
                                className="w-full bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                                placeholder="username"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-400">
                            Password
                        </label>
                        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3">
                            <Lock size={16} className="text-slate-500" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                className="w-full bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                                placeholder="password"
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                        <LogIn size={16} />
                        {submitting ? "Signing in..." : "Sign in"}
                    </button>
                </form>
            </div>
        </div>
    );
}
