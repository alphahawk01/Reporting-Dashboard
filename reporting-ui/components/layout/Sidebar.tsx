"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  LayoutDashboard,
  Monitor,
  Download,
  CalendarDays,
  Sparkles,
  Users,
  Shield,
  BarChart3,
  Bell,
  Settings,
  Trophy,
} from "lucide-react";

const sections = [
  {
    heading: "",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },

  {
    heading: "OPERATIONS",
    items: [
      {
        title: "Live Board",
        href: "/operations",
        icon: Monitor,
      },
      {
        title: "Computers",
        href: "/computers",
        icon: Monitor,
      },
      {
        title: "Downloads",
        href: "/downloads",
        icon: Download,
      },
      {
        title: "Notifications",
        href: "/notifications",
        icon: Bell,
      },
    ],
  },

 {
  heading: "FIXTURES",
  items: [
    {
      title: "Fixtures",
      href: "/fixtures",
      icon: CalendarDays,
    },
    {
      title: "Schedule",
      href: "/schedule",
      icon: CalendarDays,
    },
    {
      title: "AI Recommendations",
      href: "/recommendations",
      icon: Sparkles,
    },
  ],
},

{
  heading: "ANALYST MANAGEMENT",
  items: [
    {
      title: "Analyst Management",
      href: "/analyst-management",
      icon: Users,
    },
    {
      title: "Analyst Profiles",
      href: "/analyst-profile",
      icon: Users,
    },
    {
      title: "Affiliated Teams",
      href: "/affiliated-teams",
      icon: Shield,
    },
  ],
},

  {
    heading: "REPORTING",
    items: [
      {
        title: "Reporting",
        href: "/reporting",
        icon: BarChart3,
      },
      {
        title: "Leaderboard",
        href: "/leaderboard",
        icon: Trophy,
      },
    ],
  },

  {
    heading: "ADMIN",
    items: [
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
      },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-72 flex-col border-r border-slate-800 bg-[#0B1220]">

      <div className="border-b border-slate-800 p-6">

        <h1 className="text-2xl font-bold text-white">
          Premier Data
        </h1>

        <p className="mt-1 text-sm text-slate-400">
          Operations Platform
        </p>

      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6">

        {sections.map((section) => (

          <div
            key={section.heading}
            className="mb-8"
          >

            {section.heading && (
              <div className="mb-3 px-3 text-xs font-semibold tracking-widest text-slate-500">
                {section.heading}
              </div>
            )}

            <div className="space-y-1">

              {section.items.map((item) => {

                const Icon = item.icon;

                const active =
                  pathname.startsWith(item.href);

                return (

                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      flex items-center gap-3 rounded-lg px-3 py-3 transition
                      ${active
                        ? "bg-sky-600 text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }
                    `}
                  >

                    <Icon size={18} />

                    <span className="text-sm font-medium">
                      {item.title}
                    </span>

                  </Link>

                );

              })}

            </div>

          </div>

        ))}

      </nav>

      <div className="border-t border-slate-800 p-4 text-xs text-slate-500">

        Version 1.0

      </div>

    </aside>
  );
}