"use client";

import Link from "next/link";
import {
  Monitor,
  CalendarDays,
  Sparkles,
  Users,
  Shield,
  BarChart3,
  Download,
  Bell,
} from "lucide-react";

const sections = [
  {
    title: "Operations",
    links: [
      { title: "Live Board", href: "/operations", icon: Monitor, description: "Real-time analyst allocations and computer status" },
      { title: "Downloads", href: "/downloads", icon: Download, description: "Active and queued video downloads" },
      { title: "Notifications", href: "/notifications", icon: Bell, description: "System alerts and notifications" },
    ],
  },
  {
    title: "Fixtures",
    links: [
      { title: "Fixtures", href: "/fixtures", icon: CalendarDays, description: "All fixtures with download status and assignments" },
      { title: "Schedule", href: "/schedule", icon: CalendarDays, description: "Analyst roster and fixture allocation grid" },
      { title: "AI Recommendations", href: "/recommendations", icon: Sparkles, description: "Fixture allocation engine with scoring" },
    ],
  },
  {
    title: "Analysis",
    links: [
      { title: "Analysts", href: "/analysts", icon: Users, description: "Analyst profiles, ratings, and computer assignments" },
      { title: "Teams", href: "/teams", icon: Shield, description: "Team performance and analyst affiliations" },
      { title: "Reporting", href: "/reporting", icon: BarChart3, description: "Workforce hours, costs, and performance analytics" },
    ],
  },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">

        <h1 className="text-3xl font-bold text-slate-900">
          Operations Dashboard
        </h1>

        <p className="mt-1 text-slate-500">
          Premier Data Platform
        </p>

        <div className="mt-8 space-y-8">
          {sections.map(section => (
            <div key={section.title}>

              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                {section.title}
              </h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {section.links.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100">
                        <link.icon size={20} />
                      </div>
                      <h3 className="font-semibold text-slate-900">
                        {link.title}
                      </h3>
                    </div>
                    <p className="mt-3 text-sm text-slate-500">
                      {link.description}
                    </p>
                  </Link>
                ))}
              </div>

            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
