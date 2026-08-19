interface Props {
  field: string;
  label: string;
  currentField: string;
  ascending: boolean;
  onSort: (field: any) => void;
}

export default function SortableHeader({
  field,
  label,
  currentField,
  ascending,
  onSort,
}: Props) {
  return (
    <th
      onClick={() => onSort(field)}
      className="sticky top-0 z-20 cursor-pointer border-b border-zinc-700 bg-zinc-950 px-4 py-4 text-left uppercase tracking-wider hover:text-blue-400"
    >
      {label}

      {" "}

      {currentField === field &&
        (ascending ? "▲" : "▼")}
    </th>
  );
}