"use client";

interface Props {
    value: string;
    onChange: (value: string) => void;
}

export default function SearchBar({
    value,
    onChange,
}: Props) {
    return (
        <div className="my-4">
            <input
                type="text"
                value={value}
                onChange={(e) =>
                    onChange(e.target.value)
                }
                placeholder="Search analysts or computers..."
                className="
                    w-full
                    max-w-md
                    rounded-lg
                    border
                    border-gray-300
                    bg-white
                    px-4
                    py-2
                    text-sm
                    outline-none
                    focus:border-blue-500
                    focus:ring-2
                    focus:ring-blue-100
                "
            />
        </div>
    );
}