import { RefObject } from "react";

type Row = {
  analystName: string;
  computerName: string;
  workLocation: string;
  league: string;
  currentGame: string;
  videoStatus: string;
  isOnline: boolean;
};

interface Props {
  rows: Row[];
  tableContainerRef: RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}

export default function OperationsTable({
  rows,
  tableContainerRef,
  children,
}: Props) {
  return (
    <div
      ref={tableContainerRef}
      className="overflow-y-auto rounded-lg border border-zinc-800"
      style={{
        height: "calc(100vh - 220px)",
      }}
    >
      <table className="w-full table-auto border-collapse text-lg">
        {children}

        <tbody>
          {rows.map((row) => (
            <tr
              key={row.computerName}
              className="border-b border-zinc-800 odd:bg-zinc-950 even:bg-zinc-900 hover:bg-zinc-800"
            >
              <td className="whitespace-nowrap px-4 py-5 font-bold">
                {row.analystName}
              </td>

              <td className="whitespace-nowrap px-4">
                {row.computerName}
              </td>

              <td className="px-4">
                {row.workLocation}
              </td>

              <td className="whitespace-nowrap px-4">
                {row.league}
              </td>

              <td className="px-4">
                {row.currentGame}
              </td>

              <td className="px-4">
                {/* StatusBadge goes here */}
              </td>

              <td className="px-4">
                {/* StatusBadge goes here */}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}