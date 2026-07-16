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

type Attribute = {
  key: keyof Props["ratings"];
  label: string;
  description: string;
  bands: string[];
};

const attributes: Attribute[] = [
  {
    key: "speed",
    label: "⚡ Speed",
    description:
      "Measures average coding hours per game. Lower coding times receive higher ratings.",
    bands: [
      "99|< 5.75 hrs/game",
      "90|≤ 6.25 hrs/game",
      "80|≤ 7.00 hrs/game",
      "70|≤ 7.50 hrs/game",
      "60|≤ 8.50 hrs/game",
      "40|> 9.00 hrs/game",
    ]
  },
  {
    key: "efficiency",
    label: "💰 Efficiency",
    description:
      "Measures average cost per game. Lower costs receive higher ratings.",
    bands: [
      "99|< $180/game",
      "90|≤ $200/game",
      "80|≤ $210/game",
      "70|≤ $220/game",
      "60|≤ $240/game",
      "30|> $280/game",
    ]
  },
  {
    key: "workRate",
    label: "🏃 Work Rate",
    description:
      "Measures average coding hours worked per week.",
    bands: [
      "99|35+ hrs/week",
      "90|30+ hrs/week",
      "80|25+ hrs/week",
      "70|20+ hrs/week",
      "60|15+ hrs/week",
      "40|< 10 hrs/week",
    ]
  },
  {
    key: "experience",
    label: "🎯 Experience",
    description:
      "Measures total games completed during the year.",
    bands: [
      "99|80+ games",
      "90|65+ games",
      "80|50+ games",
      "70|30+ games",
      "60|20+ games",
      "40|< 20 games",
    ]
  },
  {
    key: "consistency",
    label: "📅 Consistency",
    description:
      "Measures the average number of games completed each week.",
    bands: [
      "99|4.0+ games/week",
      "90|3.5+ games/week",
      "80|3.0+ games/week",
      "70|2.5+ games/week",
      "60|2.0+ games/week",
      "30|< 1.5 games/week",
    ]
  },
  {
    key: "versatility",
    label: "🌍 Versatility",
    description:
      "Measures the number of unique competitions analysed.",
    bands: [
      "99|50+ competitions",
      "90|40+ competitions",
      "80|30+ competitions",
      "60|20+ competitions",
      "40|10+ competitions",
      "20|< 10 competitions",
    ]
  },
  {
    key: "knowledge",
    label: "🧠 Knowledge",
    description:
      "Measures the number of unique teams analysed.",
    bands: [
      "99|100+ teams",
      "90|90+ teams",
      "80|80+ teams",
      "60|60+ teams",
      "40|40+ teams",
      "20|< 40 teams",
    ]
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
  <div className="flex items-center gap-2">
    <span className="font-medium text-slate-300">
      {attr.label}
    </span>

    <div className="group relative inline-block">
      <span className="cursor-help text-slate-400 transition-colors hover:text-sky-400">
        ⓘ
      </span>

      <div
        className="
          absolute
          left-full
          top-24
          ml-3
          -translate-y-1/2
          z-[9999]
          w-80
          rounded-xl
          border
          border-slate-700
          bg-[#0b1220]
          p-4
          text-sm
          shadow-2xl
          ring-1
          ring-slate-800
          opacity-0
          invisible
          pointer-events-none
          transition-all
          duration-200
          group-hover:visible
          group-hover:opacity-100
          group-hover:pointer-events-auto
        "
      >
        <h4 className="mb-2 font-semibold text-white">
          {attr.label.replace(/^[^\s]+\s/, "")}
        </h4>

        <p className="mb-4 text-slate-300">
          {attr.description}
        </p>

        <div className="border-t border-slate-700 pt-3">
          <h5 className="mb-3 font-semibold text-white">
            Scoring Criteria
          </h5>

          <div className="space-y-1.5">
            {attr.bands.map((band) => {
              const [score, benchmark] = band.split("|");

              return (
                <div
                  key={band}
                  className="flex items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-slate-800"
                >
                  <span
                    className={`min-w-[42px] rounded-md px-2 py-0.5 text-center text-xs font-bold shadow-sm ${
                      Number(score) >= 95
                        ? "bg-emerald-600 text-white"
                        : Number(score) >= 90
                        ? "bg-green-600 text-white"
                        : Number(score) >= 80
                        ? "bg-sky-600 text-white"
                        : Number(score) >= 70
                        ? "bg-amber-500 text-black"
                        : Number(score) >= 60
                        ? "bg-orange-500 text-white"
                        : "bg-rose-600 text-white"
                    }`}
                  >
                    {score}
                  </span>

                  <span className="ml-4 flex-1 text-right text-slate-300">
                    {benchmark}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  </div>

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