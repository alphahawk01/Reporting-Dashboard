"use client";

type Props = {
  label: string;
  value: number;
};

function getColour(value: number) {
  if (value >= 95) return "#A855F7"; // Purple
  if (value >= 90) return "#FACC15"; // Gold
  if (value >= 80) return "#22C55E"; // Green
  if (value >= 70) return "#38BDF8"; // Blue
  if (value >= 60) return "#F97316"; // Orange
  return "#EF4444"; // Red
}

export default function AttributeBar({
  label,
  value,
}: Props) {
  return (
    <div className="space-y-1">

      <div className="flex justify-between text-sm">

        <span className="text-slate-300">
          {label}
        </span>

        <span
          className="font-bold"
          style={{
            color: getColour(value),
          }}
        >
          {value}
        </span>

      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-700">

        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${value}%`,
            background: getColour(value),
          }}
        />

      </div>

    </div>
  );
}