"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function CostByArea({ data }: { data: any[] }) {
  const grouped = useMemo(() => {
    const acc: Record<string, any> = {};

    data.forEach((row) => {
      const area = row.area_name || "Unknown";

      if (!acc[area]) {
        acc[area] = { area, cost: 0 };
      }

      acc[area].cost += Number(row.total_cost) || 0;
    });

    return Object.values(acc)
      .sort((a: any, b: any) => b.cost - a.cost)
      .slice(0, 10);
  }, [data]);

  const formatMoney = (v: any) =>
    `$${Number(v || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="w-full rounded-2xl bg-white p-6 shadow-sm border border-zinc-100">
      
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-zinc-800">
          Cost by Area
        </h3>
        <p className="text-sm text-zinc-500">
          Labour cost distribution across locations
        </p>
      </div>

      <div style={{ width: "100%", height: 360, minWidth: 0, overflow: "hidden" }}>
        <ResponsiveContainer width="99%" height="100%">
          <BarChart data={grouped} barCategoryGap="25%">
            
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#f1f5f9"
              vertical={false}
            />

            <XAxis
              dataKey="area"
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={60}
            />

            <YAxis
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                Number(v).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })
              }
            />

            <Tooltip
              cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid #e5e7eb",
                boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
              }}
              formatter={(value: any) => [formatMoney(value), "Cost"]}
            />

            <defs>
              <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>

            <Bar
              dataKey="cost"
              fill="url(#costGradient)"
              radius={[8, 8, 0, 0]}
              maxBarSize={50}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}