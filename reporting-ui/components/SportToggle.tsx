"use client";

export type SportFilter = "all" | "afl" | "football";

const OPTIONS: [SportFilter, string][] = [
    ["all", "All sports"],
    ["afl", "Aussie Rules"],
    ["football", "Football"],
];

/**
 * Sport filter toggle (All / Aussie Rules / Football), matching the sport
 * toggle style used on the Accuracy Comparison page.
 */
export default function SportToggle({
    value,
    onChange,
}: {
    value: SportFilter;
    onChange: (v: SportFilter) => void;
}) {
    return (
        <div className="flex items-center gap-1">
            {OPTIONS.map(([id, label]) => (
                <button
                    key={id}
                    onClick={() => onChange(id)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        value === id
                            ? "bg-slate-900 text-white"
                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
