"use client";

import { ReactNode } from "react";
import HoursPerWeekTrend from "./HoursPerWeekTrend";

const THEME = {
  panel: "#0f1b2d",
  border: "rgba(148,163,184,0.15)",
};

type Props = {
  title: string;
  children: ReactNode;
};
export default function DashboardChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-[350px] flex flex-col bg-[#0f1b2d] border border-slate-700/30 rounded-xl p-4">
      
      {/* HEADER */}
      <div className="mb-2">
        <h3 className="text-lg font-semibold text-slate-200">
          {title}
        </h3>
      </div>

      {/* CONTENT */}
      <div className="flex-1 min-h-0">
        {children}
      </div>

    </div>
  );
}