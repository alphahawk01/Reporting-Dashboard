interface Props {
  time: Date | null;
}

export default function OperationsHeader({
  time,
}: Props) {
  return (
    <div className="mb-8 flex items-center justify-between">
      <h1 className="text-4xl font-bold">
        Today's Analyst Allocations
      </h1>

      <div className="font-mono text-2xl">
        {time?.toLocaleTimeString()}
      </div>
    </div>
  );
}