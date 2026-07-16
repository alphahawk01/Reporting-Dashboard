"use client";

import Card from "@/components/UI/Card";

type Props = {
  ratings: {
    speed: number;
    efficiency: number;
    workRate: number;
    experience: number;
    consistency: number;
    versatility: number;
    knowledge: number;
  };
};

const attributes = [
  {
    key: "speed",
    label: "⚡ Speed",
  },
  {
    key: "efficiency",
    label: "💰 Efficiency",
  },
  {
    key: "workRate",
    label: "🏃 Work Rate",
  },
  {
    key: "experience",
    label: "🎯 Experience",
  },
  {
    key: "consistency",
    label: "📅 Consistency",
  },
  {
    key: "versatility",
    label: "🌍 Versatility",
  },
  {
    key: "knowledge",
    label: "🧠 Knowledge",
  },
];

export default function AttributeRatings({
  ratings,
}: Props) {
  return (
    <Card>
      <div className="p-6">
        <h2 className="mb-6 text-xl font-bold text-white">
          Performance Attributes
        </h2>

        <div className="grid grid-cols-2 gap-x-10 gap-y-5">
          {attributes.map((attr) => {
            const value =
              ratings[
                attr.key as keyof typeof ratings
              ];

            return (
              <div key={attr.key}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-slate-300">
                    {attr.label}
                  </span>

                  <span className="font-bold text-white">
                    {value}
                  </span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-sky-400 transition-all duration-500"
                    style={{
                      width: `${value}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}