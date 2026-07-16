// components/ui/StatBar.tsx
import { THEME } from "@/lib/theme";

export default function StatBar({
  label,
  value,
  max = 100,
  color = THEME.accent,
}: {
  label: string;
  value: number;
  max?: number;
  color?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);

  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-slate-300 mb-1">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}