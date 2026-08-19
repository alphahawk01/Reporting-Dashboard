interface Props {
  value: "Home" | "Office";
  onChange: (value: "Home" | "Office") => void;
}

export default function LocationFilter({
  value,
  onChange,
}: Props) {
  return (
    <div className="mb-6 flex items-center gap-3">

      <label className="text-sm font-medium">
        Work Location
      </label>

      <select
        value={value}
        onChange={(e) =>
          onChange(
            e.target.value as "Home" | "Office"
          )
        }
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
      >
        <option value="Office">
          Office
        </option>

        <option value="Home">
          Home
        </option>

      </select>

    </div>
  );
}