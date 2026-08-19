"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { HubConnectionState } from "@microsoft/signalr";
import { getHubConnection } from "@/lib/signalr";
import OperationsHeader from "@/components/operations/OperationsHeader";
import LocationFilter from "@/components/operations/LocationFilter";

type Row = {
  analystName: string;
  computerName: string;
  workLocation: string;
  league: string;
  currentGame: string;
  videoStatus: string;
  isOnline: boolean;
};

import { getOperations } from "@/lib/api/operations";

export default function OperationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [time, setTime] = useState<Date | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  const [sortField, setSortField] =
    useState<keyof Row>("analystName");

  const [sortAsc, setSortAsc] = useState(true);

  const [locationFilter, setLocationFilter] =
    useState<"Home" | "Office">("Office");

  const REFRESH_INTERVAL = 5000;

  const handleSort = (field: keyof Row) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  async function load() {
    try {
      const data = await getOperations(locationFilter);
      setRows(data);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    setTime(new Date());

    load();
    const hubConnection = getHubConnection();
    hubConnection.off("RefreshOperations");

    hubConnection.on("RefreshOperations", () => {
      console.log("RefreshOperations received");
      load();
    });

    (async () => {
      if (
        hubConnection.state ===
        HubConnectionState.Disconnected
      ) {
        await hubConnection.start();
      }
    })();

    const clock = setInterval(() => {
      setTime(new Date());
    }, 1000);

    const refresh = setInterval(load, REFRESH_INTERVAL);

    return () => {
      hubConnection.off("RefreshOperations");

      clearInterval(clock);
      clearInterval(refresh);
    };
  }, [locationFilter]);

  const sortedRows = useMemo(() => {
    return rows
      .sort((a, b) => {
        const av = String(a[sortField] ?? "");
        const bv = String(b[sortField] ?? "");

        return sortAsc
          ? av.localeCompare(bv, undefined, {
            numeric: true,
          })
          : bv.localeCompare(av, undefined, {
            numeric: true,
          });
      });
  }, [rows, sortField, sortAsc]);

  const videoColour = (status: string) => {
    switch (status) {
      case "Downloaded":
        return "bg-green-600";

      case "Downloading":
        return "bg-yellow-500 text-black";

      case "Waiting":
        return "bg-blue-600";

      case "Failed":
        return "bg-red-600";

      default:
        return "bg-zinc-600";
    }
  };

  const computerColour = (online: boolean) => {
    return online
      ? "bg-green-600"
      : "bg-red-600";
  };

  const Header = ({
    field,
    label,
  }: {
    field: keyof Row;
    label: string;
  }) => (
    <th
      onClick={() => handleSort(field)}
      className="sticky top-0 z-20 bg-zinc-950 cursor-pointer border-b border-zinc-700 px-4 py-4 text-left uppercase tracking-wider hover:text-blue-400"
    >
      {label}{" "}
      {sortField === field &&
        (sortAsc ? "▲" : "▼")}
    </th>
  );

  useEffect(() => {

    const container = tableContainerRef.current;
    if (!container) return;

    let paused = false;

    const interval = setInterval(() => {
      if (paused) return;

      const atBottom =
        container.scrollTop +
        container.clientHeight >=
        container.scrollHeight - 4;

      if (atBottom) {
        paused = true;

        setTimeout(() => {
          container.scrollTop = 0;
          paused = false;
        }, 2000);

        return;
      }

      container.scrollTop += 1;
    }, 40);

    return () => clearInterval(interval);
  }, [sortedRows]);

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-8 py-6">

      <OperationsHeader time={time} />

      <LocationFilter
        value={locationFilter}
        onChange={setLocationFilter}
      />

      <div className="mb-6 flex gap-3">
        <Link
          href="/operations"
          className="rounded-lg bg-blue-600 px-4 py-2"
        >
          Operations
        </Link>

        <Link
          href="/fixtures"
          className="rounded-lg bg-zinc-800 px-4 py-2"
        >
          Fixtures
        </Link>
      </div>

      <div
        ref={tableContainerRef}
        className="overflow-y-auto border border-zinc-800 rounded-lg"
        style={{
          height: "calc(100vh - 220px)",
        }}
      >
        <table className="w-full table-auto border-collapse text-lg">
          <thead className="sticky top-0 z-20 bg-zinc-950">
            <tr className="uppercase text-base">
              <Header
                field="analystName"
                label="Analyst"
              />
              <Header
                field="computerName"
                label="PC"
              />
              <Header
                field="workLocation"
                label="Work Location"
              />
              <Header
                field="league"
                label="League"
              />
              <Header
                field="currentGame"
                label="Current Game"
              />
              <Header
                field="videoStatus"
                label="Video Status"
              />
              <Header
                field="isOnline"
                label="Computer Status"
              />
            </tr>
          </thead>

          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={row.computerName}
                className="border-b border-zinc-800 odd:bg-zinc-950 even:bg-zinc-900 hover:bg-zinc-800"
              >
                <td className="px-4 py-5 font-bold whitespace-nowrap">
                  {row.analystName}
                </td>

                <td className="px-4 whitespace-nowrap">
                  {row.computerName}
                </td>

                <td className="px-4">
                  {row.workLocation}
                </td>

                <td className="px-4 whitespace-nowrap">
                  {row.league}
                </td>

                <td className="px-4">
                  {row.currentGame}
                </td>

                <td className="px-4">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${videoColour(
                      row.videoStatus
                    )}`}
                  >
                    {row.videoStatus}
                  </span>
                </td>

                <td className="px-4">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${computerColour(
                      row.isOnline
                    )}`}
                  >
                    {row.isOnline
                      ? "Online"
                      : "Offline"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}