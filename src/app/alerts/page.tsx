import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BellRing, CalendarClock, CheckCheck, CreditCard, DoorOpen, Inbox, RefreshCw, Settings2, Sparkles, type LucideIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { LocalTime } from "@/components/local-time";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { ProfilePushSettings } from "@/components/profile-push-settings";
import { markRead } from "./actions";

export const metadata: Metadata = { title: "Alerts" };

const TYPES: Record<string, [string, LucideIcon, string]> = {
  new_event: ["New match", BellRing, "text-accent bg-signal/10 border-signal/25"],
  registration_opened: ["Registration opened", DoorOpen, "text-ok bg-ok/10 border-ok/25"],
  deadline_reminder: ["Closing soon", CalendarClock, "text-warn bg-warn/10 border-warn/25"],
  availability_changed: ["Status changed", RefreshCw, "text-sky bg-sky/10 border-sky/25"],
  registration_started: ["Registration started", DoorOpen, "text-signal bg-signal/10 border-signal/25"],
  registration_confirmed: ["Registration confirmed", CheckCheck, "text-ok bg-ok/10 border-ok/25"],
  auto_registered: ["Auto-registered", Sparkles, "text-signal bg-signal/15 border-signal/30"],
  paid_event_review: ["Paid Event (Review)", CreditCard, "text-amber-500 bg-amber-500/10 border-amber-500/25"],
  missing_info: ["Action Required", AlertTriangle, "text-amber-500 bg-amber-500/15 border-amber-500/30"],
};

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ unread?: string }> }) {
  const { supabase, user } = await requireUser();
  const { unread } = await searchParams;
  let q = supabase
    .from("event_alerts")
    .select("id, alert_type, message, read_at, created_at, event_id, events(title)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (unread) q = q.is("read_at", null);
  const [{ data: alerts, error }, { count: unreadCount }] = await Promise.all([
    q,
    supabase.from("event_alerts").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Inbox"
        title="Alerts"
        actions={
          <>
            {!!unreadCount && (
              <form action={markRead}>
                <SubmitButton className="btn btn-ghost" pendingText="Marking…"><CheckCheck aria-hidden="true" /> Mark all read</SubmitButton>
              </form>
            )}
            <Link href="/profile#alerts" className="btn btn-quiet"><Settings2 aria-hidden="true" /> Settings</Link>
          </>
        }
      >
        {unreadCount ? `${unreadCount} unread.` : "You are all caught up."} New matches, openings and deadlines land here first.
      </PageHeader>

      <div className="mt-6">
        <ProfilePushSettings userId={user.id} />
      </div>

      <nav aria-label="Alert filter" className="mt-6 flex gap-2">
        <Link href="/alerts" className="chip" aria-current={!unread ? "true" : undefined}>All</Link>
        <Link href="/alerts?unread=1" className="chip" aria-current={unread ? "true" : undefined}>
          Unread{!!unreadCount && <span className="font-mono text-xs">{unreadCount}</span>}
        </Link>
      </nav>

      <div className="mt-6">
        {error && <Notice tone="bad">Could not load alerts.</Notice>}
        {alerts?.length === 0 && (
          <EmptyState icon={Inbox} title={unread ? "No unread alerts" : "No alerts yet"}>
            Set your interests and the agent will tell you when something fits.
            <div className="mt-5"><Link href="/profile#alerts" className="btn btn-ghost">Set interests</Link></div>
          </EmptyState>
        )}
        <ul className="space-y-3">
          {(alerts ?? []).map((a, i) => {
            const [label, Icon, tone] = TYPES[a.alert_type] || ["Alert", BellRing, "text-dim bg-raised border-line"];
            const ev = a.events as unknown as { title: string } | null;
            return (
              <li key={a.id} className={`rise card relative flex items-start gap-4 p-4 sm:p-5 ${a.read_at ? "opacity-70" : ""}`} style={{ "--i": i % 10 } as React.CSSProperties}>
                <span className={`grid h-11 w-11 flex-none place-items-center rounded-xl border ${tone}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-faint">
                    <span className="font-medium text-dim">{label}</span>·<LocalTime iso={a.created_at} relative />
                    {!a.read_at && <span className="h-2 w-2 rounded-full bg-flare" aria-label="Unread" />}
                  </p>
                  <Link href={`/events/${a.event_id}`} className="mt-1 block truncate font-display text-lg font-semibold hover:text-accent">{ev?.title ?? "Event"}</Link>
                  <p className="text-sm text-dim">{a.message}</p>
                </div>
                {!a.read_at && (
                  <form action={markRead} className="flex-none">
                    <input type="hidden" name="id" value={a.id} />
                    <SubmitButton className="btn btn-quiet btn-sm" pendingText="…">Mark read</SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
