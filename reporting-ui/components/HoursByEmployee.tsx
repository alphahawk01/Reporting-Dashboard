"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
} from "recharts";

export default function HoursByEmployee({ data }: { data: any[] }) {
  const grouped = Object.values(
    data.reduce((acc: any, row) => {
      const name = row.employee_name || "Unknown";

      if (!acc[name]) acc[name] = { name, hours: 0 };

      acc[name].hours += Number(row.total_hours) || 0;

      return acc;
    }, {})
  ).sort((a: any, b: any) => b.hours - a.hours);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: 20,
        border: "1px solid #E5E7EB",
        boxShadow: "0 8px 30px rgba(11,46,79,0.08)",
        width: "100%",
        minHeight: 420,
        overflowX: "auto",
      }}
    >
      {/* HEADER */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#0B2E4F" }}>
          Hours by Employee
        </div>
        <div style={{ fontSize: 12, color: "#64748B" }}>
          Employee hours (Top performers)
        </div>
      </div>

      {/* CHART WRAPPER */}
      <div
        style={{
          width: `${Math.max(grouped.length * 70, 15 * 70)}px`,
          height: 380,
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={grouped}
            margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#E5E7EB"
              vertical={false}
            />

            <XAxis
              dataKey="name"
              interval={0}
              angle={-35}
              textAnchor="end"
              height={80}
              tick={{ fontSize: 11, fill: "#64748B" }}
            />

            <YAxis
              tick={{ fontSize: 11, fill: "#64748B" }}
              axisLine={false}
              tickLine={false}
            />

            <Tooltip
              formatter={(value) => [
                Number(value).toFixed(2),
                "Hours",
              ]}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #E5E7EB",
                boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                background: "#fff",
              }}
              cursor={{ fill: "rgba(59,130,246,0.08)" }}
            />

            <Bar
              dataKey="hours"
              fill="#3b82f6"
              radius={[6, 6, 0, 0]}
              animationDuration={700}
            >
              <LabelList
                dataKey="hours"
                position="top"
                formatter={(value: any) => Number(value || 0).toFixed(1)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}