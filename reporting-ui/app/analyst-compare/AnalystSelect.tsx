"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
};

export default function AnalystSelect({
    options,
    value,
    onChange,
    placeholder = "Search analyst...",
}: Props) {

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState(value);

    const containerRef = useRef<HTMLDivElement>(null);

    // Keep the input text in sync when the selected value changes
    // from outside this component (e.g. swap button).
    useEffect(() => {
        setQuery(value);
    }, [value]);

    // Close the dropdown when clicking outside of it.
    useEffect(() => {

        function handleClickOutside(e: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
                setQuery(value);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };

    }, [value]);

    const filtered = useMemo(() => {

        const q = query.trim().toLowerCase();

        if (!q) return options;

        return options.filter(name =>
            name.toLowerCase().includes(q)
        );

    }, [options, query]);

    function selectOption(name: string) {
        onChange(name);
        setQuery(name);
        setOpen(false);
    }

    return (
        <div ref={containerRef} className="relative">

            <input
                type="text"
                value={query}
                onFocus={() => setOpen(true)}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                }}
                placeholder={placeholder}
                className="
                    w-full
                    rounded-lg
                    bg-slate-900
                    border
                    border-slate-700
                    px-4
                    py-3
                    text-white
                    placeholder:text-slate-500
                    focus:outline-none
                    focus:border-sky-500
                "
            />

            {open && (

                <div
                    className="
                        absolute
                        left-0
                        right-0
                        top-full
                        z-50
                        mt-1
                        max-h-64
                        overflow-y-auto
                        rounded-lg
                        border
                        border-slate-700
                        bg-slate-900
                        shadow-xl
                    "
                >

                    {filtered.length ? (

                        filtered.map(name => (

                            <button
                                key={name}
                                type="button"
                                onClick={() => selectOption(name)}
                                className={`
                                    block
                                    w-full
                                    truncate
                                    px-4
                                    py-2
                                    text-left
                                    text-sm
                                    transition-colors
                                    ${name === value
                                        ? "bg-sky-600/20 text-sky-300"
                                        : "text-slate-200 hover:bg-slate-800"
                                    }
                                `}
                            >
                                {name}
                            </button>

                        ))

                    ) : (

                        <div className="px-4 py-3 text-sm text-slate-500">
                            No analysts found.
                        </div>

                    )}

                </div>

            )}

        </div>
    );
}
