import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Martian_Mono, Schibsted_Grotesk } from "next/font/google";
import Link from "next/link";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import "./globals.css";
import { getUser } from "@/lib/auth";
import { signOut } from "@/app/actions";
import { Logo } from "@/components/logo";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { SignInButton } from "@/components/sign-in-button";
import { Menu } from "@/components/menu";
import { TabBar } from "@/components/tab-bar";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted", display: "swap" });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--font-martian", display: "swap" });

export const metadata: Metadata = {
  title: { default: "EventPilot: find events first, fill forms right", template: "%s · EventPilot" },
  description: "An agent that finds hackathons, competitions and workshops worldwide, alerts you, and prepares registration forms you approve.",
};
export const viewport: Viewport = { themeColor: "#faf6f0", colorScheme: "light" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase, user } = await getUser();
  let unread = 0;
  if (user) {
    const { count } = await supabase.from("event_alerts").select("id", { count: "exact", head: true }).is("read_at", null);
    unread = count ?? 0;
  }
  const items: NavItem[] = [
    { href: "/events", label: "Events" },
    ...(user
      ? [
          { href: "/alerts", label: "Alerts", badge: unread },
          { href: "/registrations", label: "Registrations" },
          { href: "/profile", label: "Profile" },
        ]
      : []),
  ];
  const isAdmin = user?.app_metadata?.role === "admin";
  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "";

  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className={`flex min-h-dvh flex-col ${user ? "pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0" : ""}`}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-signal focus:px-4 focus:py-2 focus:text-signal-ink">
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-xl">
          <nav className="shell flex h-16 items-center gap-3 md:gap-6" aria-label="Main">
            <Logo />
            <div className="hidden md:block">
              <NavLinks items={items} />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {!user && <Link href="/events" className="btn btn-quiet btn-sm md:hidden">Events</Link>}
              {user ? (
                <Menu
                  label="Account menu"
                  summary={
                    <span className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface p-1 text-sm text-dim transition-colors hover:border-text hover:text-text md:pr-3">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-text font-display text-sm font-bold text-ink">
                        {name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="hidden max-w-36 truncate md:block">{name}</span>
                    </span>
                  }
                >
                  <p className="truncate px-3 pb-2 pt-1 text-xs text-faint">{user.email}</p>
                  <Link href="/profile" className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-dim hover:bg-raised hover:text-text">
                    <UserRound className="h-4 w-4" aria-hidden="true" /> Profile &amp; settings
                  </Link>
                  {isAdmin && (
                    <Link href="/admin" className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-dim hover:bg-raised hover:text-text">
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Admin
                    </Link>
                  )}
                  <form action={signOut} className="border-t border-line pt-1">
                    <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-dim hover:bg-raised hover:text-text">
                      <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
                    </button>
                  </form>
                </Menu>
              ) : (
                <SignInButton compact />
              )}
            </div>
          </nav>
        </header>

        <main id="main" className="flex-1">{children}</main>

        <footer className="on-dark mt-24">
          <div className="shell grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
            <div className="space-y-3">
              <Logo />
              <p className="max-w-sm text-sm text-dim">
                Finds events, alerts you, prepares forms. You approve every submission. No CAPTCHA solving, no queue jumping,
                no payments on your behalf.
              </p>
            </div>
            <div>
              <p className="eyebrow mb-3">Product</p>
              <ul className="space-y-2 text-sm text-dim">
                <li><Link className="hover:text-text" href="/events">Browse events</Link></li>
                <li><Link className="hover:text-text" href="/events?prize=1">Prize money events</Link></li>
                <li><Link className="hover:text-text" href="/alerts">Alerts</Link></li>
                <li><Link className="hover:text-text" href="/registrations">Registrations</Link></li>
              </ul>
            </div>
            <div>
              <p className="eyebrow mb-3">Sources</p>
              <ul className="space-y-2 text-sm text-dim">
                <li>Devpost · Unstop · Devfolio</li>
                <li>HackerEarth · Major League Hacking</li>
                <li>College website feeds</li>
              </ul>
            </div>
          </div>
          <div className="shell flex flex-col gap-2 border-t border-line py-6 text-xs text-faint sm:flex-row sm:justify-between">
            <p>EventPilot shows the source and last check time on every event. Always confirm on the official page.</p>
            <p className="font-mono">Built on free tiers · ₹0</p>
          </div>
        </footer>
        {user && <TabBar unread={unread} />}
      </body>
    </html>
  );
}
