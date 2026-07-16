// app/analyst-profile/BenchmarkRadar.tsx
import Card from "@/components/UI/Card";
import { THEME } from "@/lib/theme";

const metrics = [
  { label: "Accuracy", value: 85 },
  { label: "Speed", value: 72 },
  { label: "Depth", value: 90 },
  { label: "Efficiency", value: 78 },
  { label: "Coverage", value: 66 },
];

export default function BenchmarkRadar({ data }: any) {
    return (
    <Card>
      <h2 className="text-white font-semibold mb-4">Benchmarking</h2>

      <div className="space-y-3">
        {metrics.map((m) => (
          <div key={m.label}>
            <div className="flex justify-between text-xs text-slate-300 mb-1">
              <span>{m.label}</span>
              <span>{m.value}%</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${m.value}%`,
                  background: THEME.accent,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}