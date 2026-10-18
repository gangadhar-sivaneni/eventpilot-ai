"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ClipboardList, Compass, UserRound } from "lucide-react";

const TABS = [
  { href: "/events", label: "Events", icon: Compass },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/registrations", label: "Registrations", icon: ClipboardList },
  { href: "/profile", label: "Profile", icon: UserRound },
];

// Phone navigation for signed-in users: thumb-reachable, 4 tabs, active tab marked.
export function TabBar({ unread }: { unread: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <ul className="grid grid-cols-4">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium transition-colors ${active ? "text-text" : "text-faint"}`}>
                {active && <span aria-hidden="true" className="absolute top-0 h-0.5 w-10 rounded-full bg-signal" />}
                <span className="relative">
                  <Icon className={`h-5 w-5 ${active ? "text-accent" : ""}`} aria-hidden="true" />
                  {href === "/alerts" && unread > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-signal px-1 font-mono text-[0.6rem] font-bold text-signal-ink">
                      {unread > 9 ? "9+" : unread}<span className="sr-only"> unread</span>
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
