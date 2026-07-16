// app/analyst-profile/StrengthsPanel.tsx
import Card from "@/components/UI/Card";
import { THEME } from "@/lib/theme";

const strengths = [
  { text: "Elite EPL tactical breakdowns", tag: "High Impact" },
  { text: "Fast turnaround time", tag: "Efficiency" },
  { text: "Strong opponent analysis accuracy", tag: "Accuracy" },
];

export default function StrengthPanel({ data }: any) {
    return (
    <Card>
      <h2 className="text-white font-semibold mb-3">Strengths</h2>

      <div className="space-y-2">
        {strengths.map((s) => (
          <div
            key={s.text}
            className="flex justify-between items-center p-2 rounded-md"
            style={{ background: THEME.panelSoft }}
          >
            <span className="text-sm text-slate-200">{s.text}</span>
            <span className="text-xs text-green-400">{s.tag}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}