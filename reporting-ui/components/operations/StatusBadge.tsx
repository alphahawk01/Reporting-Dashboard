interface Props {
  label: string;
  className: string;
}

export default function StatusBadge({
  label,
  className,
}: Props) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-semibold ${className}`}
    >
      {label}
    </span>
  );
}