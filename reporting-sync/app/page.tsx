"use client";

import { useEffect, useMemo, useState } from "react";

type Shift = {
  Name: string;
  "Area Name": string;
  "Total Hours": number;
  "Total Cost": number;
  Date: string;
};

export default function Home() {
  const [data, setData] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/data")
      .then((res) => res.json())
      .then((rows) => {
        setData(rows);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const stats = useMemo(() => {
    const hours = data.reduce(
      (sum, row) => sum + Number(row["Total Hours"] || 0),
      0
    );

    const cost = data.reduce(
      (sum, row) => sum + Number(row["Total Cost"] || 0),
      0
    );

    const employees = new Set(data.map((r) => r.Name));

    return {
      hours,
      cost,
      employees: employees.size,
      shifts: data.length,
    };
  }, [data]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <h1 className="text-xl font-semibold">Loading Dashboard...</h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-8">
      <div className="mx-auto max-w-7xl">

        <h1 className="text-4xl font-bold mb-8">
          Workforce Reporting Dashboard
        </h1>

        <div className="grid gap-6 md:grid-cols-4 mb-10">

          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-zinc-500">Total Hours</p>
            <h2 className="text-3xl font-bold">
              {stats.hours.toFixed(2)}
            </h2>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-zinc-500">Total Cost</p>
            <h2 className="text-3xl font-bold">
              $
              {stats.cost.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </h2>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-zinc-500">Employees</p>
            <h2 className="text-3xl font-bold">
              {stats.employees}
            </h2>
          </div>

          <div className="rounded-xl bg-white p-6 shadow">
            <p className="text-zinc-500">Shifts</p>
            <h2 className="text-3xl font-bold">
              {stats.shifts}
            </h2>
          </div>

        </div>

        <div className="rounded-xl bg-white shadow">

          <div className="border-b p-5">
            <h2 className="text-xl font-semibold">
              Recent Shifts
            </h2>
          </div>

          <div className="overflow-auto">

            <table className="min-w-full">

              <thead className="bg-zinc-100">

                <tr>

                  <th className="px-4 py-3 text-left">Employee</th>
                  <th className="px-4 py-3 text-left">Area</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">Hours</th>
                  <th className="px-4 py-3 text-right">Cost</th>

                </tr>

              </thead>

              <tbody>

                {data.slice(0, 100).map((row, index) => (
                  <tr
                    key={index}
                    className="border-b hover:bg-zinc-50"
                  >
                    <td className="px-4 py-3">{row.Name}</td>

                    <td className="px-4 py-3">
                      {row["Area Name"]}
                    </td>

                    <td className="px-4 py-3">{row.Date}</td>

                    <td className="px-4 py-3 text-right">
                      {Number(row["Total Hours"]).toFixed(2)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      $
                      {Number(row["Total Cost"]).toFixed(2)}
                    </td>
                  </tr>
                ))}

              </tbody>

            </table>

          </div>

        </div>

      </div>
    </main>
  );
}