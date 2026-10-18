"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; badge?: number };

// Active link gets aria-current and a lime underline that slides in.
export function NavLinks({ items, vertical = false }: { items: NavItem[]; vertical?: boolean }) {
  const path = usePathname();
  return (
    <ul className={vertical ? "flex flex-col gap-1" : "flex items-center gap-1"}>
      {items.map(({ href, label, badge }) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-2 rounded-lg px-3 py-2 text-[0.94rem] font-medium transition-colors ${
                active ? "text-text" : "text-dim hover:text-text"
              } ${vertical ? "hover:bg-raised" : ""}`}
            >
              {label}
              {!!badge && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-signal px-1.5 font-mono text-[0.68rem] font-bold text-signal-ink">
                  {badge > 99 ? "99+" : badge}
                  <span className="sr-only"> unread</span>
                </span>
              )}
              {!vertical && (
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-3 -bottom-[13px] h-0.5 origin-left rounded-full bg-signal transition-transform duration-300 ${
                    active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50"
                  }`}
                />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
