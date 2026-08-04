interface Props {
  breakdown: {
    league: number;
    homeTeam: number;
    awayTeam: number;
    recent: number;
    quality: number;
    speed: number;
  };
}

function Item({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg bg-slate-900 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-1 text-lg font-semibold text-white">
        {value.toFixed(1)}
      </div>
    </div>
  );
}

export default function ScoreBreakdown({
  breakdown,
}: Props) {
  return (
    <div className="mt-5 grid grid-cols-4 gap-3">

      <Item label="League" value={breakdown.league} />

      <Item label="Home" value={breakdown.homeTeam} />

      <Item label="Away" value={breakdown.awayTeam} />

      <Item label="Recent" value={breakdown.recent} />

      <Item label="Quality" value={breakdown.quality} />

      <Item label="Speed" value={breakdown.speed} />

    </div>
  );
}