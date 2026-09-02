"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Trophy, History, Trash2 } from "lucide-react";
import {
  getAllAccuracyChecks,
  countMasterChecks,
  summariseByAnalyst,
  deleteAccuracyCheck,
  type AccuracyCheck,
} from "@/lib/api/accuracyChecks";

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function accColor(a: number) {
  if (a >= 0.9) return "text-emerald-600";
  if (a >= 0.75) return "text-amber-600";
  return "text-red-600";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AccuracyChecksPage() {
  const [checks, setChecks] = useState<AccuracyCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnalyst, setSelectedAnalyst] = useState<string>("");

  async function load() {
    try {
      setLoading(true);
      const data = await getAllAccuracyChecks();
      setChecks(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to load accuracy checks."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const analystSummaries = useMemo(
    () => summariseByAnalyst(checks),
    [checks]
  );

  const masterCounts = useMemo(() => countMasterChecks(checks), [checks]);

  // Default the selected analyst once data loads.
  useEffect(() => {
    if (!selectedAnalyst && analystSummaries.length > 0) {
      setSelectedAnalyst(analystSummaries[0].analystName);
    }
  }, [analystSummaries, selectedAnalyst]);

  const analystChecks = useMemo(() => {
    if (!selectedAnalyst) return [];
    return checks
      .filter(
        (c) =>
          c.analyst_name.trim().toLowerCase() ===
          selectedAnalyst.trim().toLowerCase()
      )
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }, [checks, selectedAnalyst]);

  const trendData = useMemo(
    () =>
      analystChecks.map((c, i) => ({
        idx: i + 1,
        label: c.match_label || formatDate(c.created_at),
        accuracy: Number((c.accuracy * 100).toFixed(1)),
      })),
    [analystChecks]
  );

  const analystRollup = useMemo(
    () =>
      analystSummaries.find(
        (s) =>
          s.analystName.trim().toLowerCase() ===
          selectedAnalyst.trim().toLowerCase()
      ),
    [analystSummaries, selectedAnalyst]
  );

  async function handleDelete(id: number) {
    if (!confirm("Delete this saved accuracy check?")) return;
    try {
      await deleteAccuracyCheck(id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  if (loading) {
    return (
      <div className="min-h-full bg-slate-100 p-8 text-slate-600">
        Loading accuracy checks...
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl p-6 lg:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900">
              <History size={26} /> Accuracy History
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Accuracy checks accumulated over the season. Track each analyst&apos;s
              trend and see who has completed the most master checks.
            </p>
          </div>
          <Link
            href="/accuracy-compare"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
          >
            New comparison
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {checks.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            No accuracy checks saved yet. Run a comparison and save it to build
            history here.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* LEFT: per-analyst history */}
            <div className="space-y-6">
              {/* Analyst picker */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Analyst
                </label>
                <select
                  value={selectedAnalyst}
                  onChange={(e) => setSelectedAnalyst(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
                >
                  {analystSummaries.map((s) => (
                    <option key={s.analystName} value={s.analystName}>
                      {s.analystName} ({s.checks} check{s.checks === 1 ? "" : "s"})
                    </option>
                  ))}
                </select>

                {analystRollup && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Checks" value={`${analystRollup.checks}`} />
                    <Stat
                      label="Avg accuracy"
                      value={pct(analystRollup.avgAccuracy)}
                      color={accColor(analystRollup.avgAccuracy)}
                    />
                    <Stat
                      label="Latest"
                      value={pct(analystRollup.latestAccuracy)}
                      color={accColor(analystRollup.latestAccuracy)}
                    />
                    <Stat
                      label="Exact / Master"
                      value={`${analystRollup.totalExact}/${analystRollup.totalMaster}`}
                    />
                  </div>
                )}
              </div>

              {/* Trend chart */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">
                  Accuracy trend
                </h2>
                {trendData.length < 2 ? (
                  <p className="py-8 text-center text-sm text-slate-400">
                    Need at least 2 saved checks to show a trend.
                  </p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(15,23,42,0.06)" vertical={false} />
                        <XAxis dataKey="idx" tick={{ fontSize: 11, fill: "#64748B" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748B" }} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          formatter={(v: any) => [`${v}%`, "Accuracy"]}
                          labelFormatter={(_l, p) => (p?.[0]?.payload?.label ?? "")}
                        />
                        <Line type="monotone" dataKey="accuracy" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* History table */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <h2 className="border-b border-slate-100 p-5 text-sm font-semibold text-slate-700">
                  Saved checks
                </h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Match</th>
                        <th className="px-4 py-2.5">Master by</th>
                        <th className="px-4 py-2.5 text-right">Accuracy</th>
                        <th className="px-4 py-2.5 text-right">Exact/Master</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {analystChecks
                        .slice()
                        .reverse()
                        .map((c) => (
                          <tr key={c.id} className="border-t border-slate-100">
                            <td className="px-4 py-2.5 text-slate-600">
                              {formatDate(c.created_at)}
                            </td>
                            <td className="px-4 py-2.5 text-slate-700">
                              {c.match_label || "—"}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">
                              {c.master_analyst_name || "—"}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-semibold ${accColor(c.accuracy)}`}>
                              {pct(c.accuracy)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-600">
                              {c.exact}/{c.master_total}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                onClick={() => handleDelete(c.id)}
                                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                title="Delete check"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* RIGHT: master-checks leaderboard */}
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Trophy size={16} className="text-amber-500" /> Master checks completed
                </h2>
                <p className="mb-4 text-xs text-slate-400">
                  How many accuracy checks each person has completed as the
                  master coder.
                </p>

                {masterCounts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    No master checks recorded yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {masterCounts.map((m, i) => (
                      <div
                        key={m.masterAnalystName}
                        className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-400">
                            {i + 1}
                          </span>
                          <span className="truncate text-sm font-medium text-slate-700">
                            {m.masterAnalystName}
                          </span>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-bold text-white">
                          {m.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-bold ${color ?? "text-slate-800"}`}>
        {value}
      </div>
    </div>
  );
}
