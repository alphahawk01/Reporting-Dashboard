"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

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
    placeholder = "Select analyst...",
}: Props) {

    const [open, setOpen] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);

    // Close the dropdown when clicking outside of it.
    useEffect(() => {

        function handleClickOutside(e: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };

    }, []);

    function selectOption(name: string) {
        onChange(name);
        setOpen(false);
    }

    return (
        <div ref={containerRef} className="relative">

            <button
                type="button"
                onClick={() => setOpen(prev => !prev)}
                className="
                    flex
                    w-full
                    items-center
                    justify-between
                    rounded-lg
                    bg-slate-900
                    border
                    border-slate-700
                    px-4
                    py-3
                    text-left
                    text-white
                    transition-colors
                    hover:border-slate-500
                    focus:outline-none
                    focus:border-sky-500
                "
            >
                <span className={value ? "truncate" : "truncate text-slate-500"}>
                    {value || placeholder}
                </span>

                <ChevronDown
                    size={18}
                    className={`ml-2 flex-shrink-0 text-slate-400 transition-transform ${
                        open ? "rotate-180" : ""
                    }`}
                />
            </button>

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

                    {options.length ? (

                        options.map(name => (

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
