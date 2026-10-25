import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Bricolage_Grotesque, Martian_Mono, Schibsted_Grotesk } from "next/font/google";
import Link from "next/link";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import "./globals.css";
import { getUser } from "@/lib/auth";
import { DEMO } from "@/lib/demo-flag";
import { signOut } from "@/app/actions";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { LoginButton } from "@/components/login-button";
import { Menu } from "@/components/menu";
import { TabBar } from "@/components/tab-bar";
import { DeletionScheduledPopup } from "@/components/deletion-scheduled-popup";
import { PushNotificationBanner } from "@/components/push-notification-banner";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted", display: "swap" });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--font-martian", display: "swap" });

export const metadata: Metadata = {
  title: { default: "EventPilot: find events first, fill forms right", template: "%s · EventPilot" },
  description: "Verified technology events focused on Hyderabad and India, with online events included.",
};
export const viewport: Viewport = { themeColor: "#faf6f0", colorScheme: "light" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase, user } = await getUser();
  const cookieStore = await cookies();
  const needsPassword = Boolean(user && cookieStore.get("needs_password")?.value === "1");


  let unread = 0;
  if (user && !needsPassword) {
    const { count } = await supabase.from("event_alerts").select("id", { count: "exact", head: true }).is("read_at", null);
    unread = count ?? 0;
  }
  const items: NavItem[] = [
    { href: "/events", label: "Events" },
    ...(user && !needsPassword
      ? [
          { href: "/alerts", label: "Alerts", badge: unread },
          { href: "/registrations", label: "Registrations" },
          { href: "/profile", label: "Profile" },
        ]
      : []),
  ];
  const isAdmin = user?.app_metadata?.role === "admin";
  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "";
  const deletionCancelled = cookieStore.get("deletion_cancelled")?.value === "1";

  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className={`flex min-h-dvh flex-col ${user && !needsPassword ? "pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0" : ""}`}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-signal focus:px-4 focus:py-2 focus:text-signal-ink">
          Skip to content
        </a>
        {deletionCancelled && (
          <div className="bg-ok/10 border-b border-ok/30 py-2.5 px-4 text-center text-xs font-semibold text-ok flex items-center justify-center gap-2">
            <span>✓ Welcome back! Your pending account deletion request has been automatically cancelled. Your account and all saved data remain active.</span>
          </div>
        )}
        <Suspense fallback={null}>
          <DeletionScheduledPopup />
        </Suspense>
        <PushNotificationBanner />
        <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-xl">
          <nav className="shell flex h-16 items-center gap-3 md:gap-6" aria-label="Main">
            <Logo />
            {!needsPassword && (
              <div className="hidden md:block">
                <NavLinks items={items} />
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              {!user && <Link href="/events" className="btn btn-quiet btn-sm md:hidden">Events</Link>}
              {user ? (
                needsPassword ? (
                  <form action={signOut}>
                    <button className="btn btn-ghost btn-sm text-faint hover:text-bad">
                      <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
                    </button>
                  </form>
                ) : (
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
                )
              ) : (
                <LoginButton compact />
              )}
            </div>
          </nav>
        </header>

        {DEMO && <div role="status" className="border-b border-warn/30 bg-warn/10 px-4 py-2 text-center text-sm text-warn">
          Demo catalogue: these sample events are not live listings.
        </div>}


        <main id="main" className="flex-1">{children}</main>

        <footer className="on-dark mt-24 border-t border-line/40">
          <div className="shell grid gap-10 py-14 sm:py-16 md:grid-cols-[1.6fr_1fr_1.2fr]">
            <div className="space-y-4">
              <Logo />
              <p className="max-w-md text-sm text-dim leading-relaxed">
                The premier autonomous radar for tech events, hackathons, and developer conferences. Real-time discovery, intelligent deadline tracking, and verified application prep.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="pill pill-ok text-xs">
                  <span className="ping relative h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
                  Live Sync Active
                </span>
                <span className="pill text-xs">Verified Direct Links</span>
                <span className="pill text-xs">Zero Hallucination</span>
              </div>
            </div>
            <div>
              <p className="eyebrow mb-3.5">Product</p>
              <ul className="space-y-2.5 text-sm text-dim">
                <li><Link className="hover:text-text transition-colors" href="/events">Browse all events</Link></li>
                <li><Link className="hover:text-text transition-colors" href="/events?prize=1">Prize money hackathons</Link></li>
                <li><Link className="hover:text-text transition-colors" href="/events?fee=free">Free registrations</Link></li>
                <li><Link className="hover:text-text transition-colors" href="/alerts">Personalized alerts</Link></li>
                <li><Link className="hover:text-text transition-colors" href="/registrations">Form co-pilot</Link></li>
              </ul>
            </div>
            <div>
              <p className="eyebrow mb-3.5">Verified Platforms</p>
              <ul className="space-y-2.5 text-sm text-dim">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
                  <span>Devfolio · Unstop · Devpost</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
                  <span>Luma · StudentTribe · HackerEarth</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
                  <span>Google Developer Groups · MLH</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="shell flex flex-col gap-3 border-t border-line/40 py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} EventPilot. All rights reserved. Live verified event data.</p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-dim">Autonomous Event Discovery & Application Prep</span>
            </div>
          </div>
        </footer>
        {user && !needsPassword && <TabBar unread={unread} />}
      </body>
    </html>
  );
}
