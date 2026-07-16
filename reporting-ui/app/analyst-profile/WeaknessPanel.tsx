// app/analyst-profile/WeaknessesPanel.tsx
import Card from "@/components/UI/Card";
import { THEME } from "@/lib/theme";

const weaknesses = [
  "Lower Bundesliga coverage",
  "Slower turnaround on complex fixtures",
  "Limited international match exposure",
];

export default function WeaknessPanel({ data }: any) {
    return (
    <Card>
      <h2 className="text-white font-semibold mb-3">Improvement Areas</h2>

      <div className="space-y-2">
        {weaknesses.map((w) => (
          <div
            key={w}
            className="p-2 rounded-md text-sm text-slate-300"
            style={{ background: THEME.panelSoft }}
          >
            {w}
          </div>
        ))}
      </div>
    </Card>
  );
}