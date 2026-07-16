"use client";

import { useEffect, useMemo } from "react";
import Card from "@/components/UI/Card";
import { THEME } from "@/lib/theme";
import { useState } from "react";
import {
  getAnalystImage,
  getAnalystInitials,
} from "./analystImages";

export default function AnalystHeaderCard({ data }: any) {
  // -------------------------
  // SAFE RATINGS (ALWAYS DEFINED)
  // -------------------------
const ratings = data?.ratings ?? {
  games: "Below Average",
  hours: "Average",
  cost: "Below Average",
};


  // -------------------------
  // DEBUG (ONLY ONE EFFECT)
  // -------------------------
  useEffect(() => {
    console.log("📊 HEADER DATA RECEIVED:", data);
    console.log("📊 RATINGS:", ratings);
    console.log("📊 KEYS:", Object.keys(data || {}));
  }, [data, ratings]);

  // -------------------------
  // RATING COLOR
  // -------------------------
  const getRatingColor = (rating?: string) => {
    switch (rating) {
      case "Elite":
        return "#3b82f6";
      case "Above Avg":
      case "Above Average":
        return "#22c55e";
      case "Average":
        return "#f59e0b";
      case "Below Avg":
      case "Below Average":
        return "#ef4444";
      default:
        return "rgba(255,255,255,0.2)";
    }
  };

// -------------------------
// PROFILE IMAGE
// -------------------------
const image = getAnalystImage(data?.name ?? "");

const initials = getAnalystInitials(data?.name ?? "");

const [imageError, setImageError] = useState(false);

const showImage = image && !imageError;

  // -------------------------
  // KPI CONFIG
  // -------------------------
  const kpis = [
    {
      label: "Total Games",
      value: `${data?.totalGames ?? 0}`,
      rating: ratings.games,
    },
    {
      label: "Avg Hours / Game",
      value: `${(data?.avgHoursPerGame ?? 0).toFixed(2)}h`,
      rating: ratings.hours,
    },
    {
      label: "Avg Cost / Game",
      value: (data?.avgCostPerGame ?? 0).toLocaleString("en-AU", {
        style: "currency",
        currency: "AUD",
      }),
      rating: ratings.cost,
    },
    {
      label: "Total Hours",
      value: `${(data?.totalHours ?? 0).toFixed(2)}h`,
    },
  ];

  // -------------------------
  // RENDER
  // -------------------------
  return (
    <Card>
      <div
        className="relative rounded-xl p-5 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${THEME.panelSoft}, ${THEME.panel})`,
        }}
      >
        {/* glow */}
        <div
          className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-20"
          style={{ background: THEME.accent }}
        />

        {/* HEADER */}
        <div className="flex items-center gap-4 relative">
 <div
  className="w-20 h-20 rounded-full overflow-hidden border-2 shadow-lg flex items-center justify-center"
  style={{
    background: THEME.panel,
    borderColor: THEME.accent,
  }}
>
  {showImage ? (
    <img
      src={image!}
      alt={data?.name}
      className="w-full h-full object-cover"
      onError={() => setImageError(true)}
    />
  ) : (
    <span
      className="text-2xl font-bold"
      style={{ color: THEME.accent }}
    >
      {initials}
    </span>
  )}
</div>

          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white">
              {data?.name}
            </h1>
            <p className="text-sm text-slate-400">
              Analyst Performance Overview
            </p>
          </div>

          <div
            className="text-xs px-3 py-1 rounded-full"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: THEME.accent,
            }}
          >
            Active
          </div>
        </div>

        {/* KPI STRIP */}
        <div className="flex gap-3 mt-5">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="flex-1 rounded-lg px-3 py-2"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <p className="text-[15px] text-slate-200">{kpi.label}</p>

              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-sm font-semibold text-white">
                  {kpi.value}
                </p>

                {kpi.rating && (
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 6,
                      background: getRatingColor(kpi.rating),
                      color: "#fff",
                    }}
                  >
                    {kpi.rating}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}