"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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
  GitCompare,
  Globe,
  FileCheck2,
  History,
  KeyRound,
  UserCog,
  LogOut,
  Flag,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthContext";
import { pageKeyForPath, ROLE_LABELS } from "@/lib/api/auth";

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
      title: "Competitions",
      href: "/competitions",
      icon: Globe,
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
      {
        title: "Analyst Comparison",
        href: "/analyst-compare",
        icon: GitCompare,
      },
      {
        title: "Accuracy Comparison",
        href: "/accuracy-compare",
        icon: FileCheck2,
      },
      {
        title: "Accuracy History",
        href: "/accuracy-checks",
        icon: History,
      },
    ],
  },

  {
    heading: "ADMIN",
    items: [
      {
        title: "Disputes",
        href: "/disputes",
        icon: Flag,
      },
      {
        title: "User Accounts",
        href: "/users",
        icon: UserCog,
      },
      {
        title: "Permissions",
        href: "/permissions",
        icon: KeyRound,
      },
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
  const router = useRouter();
  const { user, hasAccess, logout } = useAuth();

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  // Only show items the current role can access; drop empty sections.
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        hasAccess(pageKeyForPath(item.href))
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="flex w-72 flex-col border-r border-slate-800 bg-[#0B1220]">

      <div className="border-b border-slate-800 px-6 py-6">

        <Image
          src="/Premier Data_Logo.png"
          alt="Premier Data logo"
          width={543}
          height={242}
          priority
          className="mx-auto h-auto w-full max-w-[240px] object-contain"
        />

        <p className="mt-3 text-center text-sm font-medium tracking-wide text-slate-400">
          Operations Platform
        </p>

      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6">

        {visibleSections.map((section) => (

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

      <div className="border-t border-slate-800 p-4">

        {user && (
          <div className="mb-3">
            <div className="truncate text-sm font-medium text-white">
              {user.analyst_name || user.username}
            </div>
            <div className="text-xs text-slate-500">
              {ROLE_LABELS[user.role]}
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          <LogOut size={16} /> Sign out
        </button>

      </div>

    </aside>
  );
}