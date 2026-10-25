import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, ChevronLeft, ChevronRight, Radar, Search, X } from "lucide-react";
import { getUser } from "@/lib/auth";
import { EVENT_COLUMNS, FILTER_KEYS, type EventRow } from "@/lib/events";
import { EventCard } from "@/components/event-card";
import { FilterPanel } from "@/components/filter-panel";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { saveSearch } from "./actions";

export const metadata: Metadata = { title: "Events" };

const PAGE_SIZE = 24;
type Key = (typeof FILTER_KEYS)[number];
type Filters = Partial<Record<Key | "page", string>>;

const QUICK: [string, Partial<Record<Key, string>>][] = [
  ["📍 Hyderabad", { city: "Hyderabad" }],
  ["🎓 College Tech", { category: "college" }],
  ["🏢 Big Tech & Companies", { category: "corporate" }],
  ["Open now", { status: "open" }],
  ["Prize money", { prize: "1" }],
  ["Free", { fee: "free" }],
  ["Hackathons", { category: "hackathon" }],
  ["In person", { format: "in_person" }],
  ["Online", { format: "online" }],
];
const LABELS: Record<Key, string> = {
  q: "Search", country: "Country", city: "City", format: "Format", category: "Category",
  fee: "Fee", status: "Registration", prize: "Prize money", from: "Starts after", to: "Starts before",
};

export default async function EventsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const f = await searchParams;
  const filters = clean(f);
  const page = Math.max(1, Number(f.page) || 1);
  const { supabase, user } = await getUser();

  const nowIso = new Date().toISOString();
  const freshSince = new Date(Date.parse(nowIso) - 24 * 60 * 60 * 1000).toISOString();
  // Supabase's filter builder types recurse through each chained filter; the
  // filters below are selected dynamically from URL params, so keep this builder loose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("events")
    .select(EVENT_COLUMNS, { count: "exact" })
    .not("quality_verified_at", "is", null)
    .not("registration_url", "is", null)
    .gte("quality_verified_at", freshSince)
    .gte("last_checked_at", freshSince)
    .gt("starts_at", nowIso)
    .neq("registration_status", "closed")
    .order("first_seen_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (f.q) {
    const term = `%${f.q}%`;
    query = query.or(`title.ilike.${term},organizer.ilike.${term},description.ilike.${term},city.ilike.${term}`);
  }
  if (f.country) query = query.ilike("country", f.country);
  if (f.city) query = query.ilike("city", `%${f.city}%`);
  if (f.format) query = query.eq("format", f.format);
  if (f.category) query = query.contains("categories", [f.category.toLowerCase()]);
  if (f.fee) query = query.eq("fee_status", f.fee);
  if (f.status) query = query.eq("registration_status", f.status);
  if (f.prize) query = query.not("prize_text" as never, "is", null as never);
  if (f.from) query = query.gte("starts_at", f.from);
  if (f.to) query = query.lte("starts_at", `${f.to}T23:59:59Z`);

  const { data, count, error } = await query;
  const events = (data ?? []) as EventRow[];
  const total = count ?? 0;
  const pages = Math.ceil(total / PAGE_SIZE);
  const href = (p: Partial<Record<Key | "page", string | undefined>>) => {
    const merged = Object.fromEntries(Object.entries({ ...filters, ...p }).filter(([, v]) => v)) as Record<string, string>;
    const qs = new URLSearchParams(merged).toString();
    return qs ? `/events?${qs}` : "/events";
  };
  const isOn = (q: Partial<Record<Key, string>>) => Object.entries(q).every(([k, v]) => filters[k as Key] === v);
  const toggle = (q: Partial<Record<Key, string>>) =>
    href(Object.fromEntries(Object.entries(q).map(([k, v]) => [k, isOn(q) ? undefined : v])));

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Catalogue"
        title="Events"
        actions={
          user && Object.keys(filters).length > 0 ? (
            <form action={saveSearch} className="flex gap-2">
              {Object.entries(filters).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <input name="name" placeholder="Name this search" aria-label="Saved search name" required maxLength={80} className="field max-w-48" />
              <SubmitButton className="btn btn-ghost" pendingText="Saving…"><Bookmark aria-hidden="true" /> Save</SubmitButton>
            </form>
          ) : null
        }
      >
        {error ? "The catalogue is not reachable right now." : `${total.toLocaleString()} upcoming tech event${total === 1 ? "" : "s"} checked in the last 24 hours.`}
      </PageHeader>

      <nav aria-label="Quick filters" className="no-scrollbar -mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
        <Link href="/events" className="chip" aria-current={Object.keys(filters).length === 0 ? "true" : undefined}>All</Link>
        {QUICK.map(([label, q]) => (
          <Link key={label} href={toggle(q)} className="chip flex-none" aria-current={isOn(q) ? "true" : undefined}>{label}</Link>
        ))}
      </nav>

      <div className="mt-8 grid gap-8 lg:grid-cols-[17rem_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <FilterPanel active={Object.keys(filters).length}>
            <form className="card space-y-4 p-5" role="search">
              <div>
                <label htmlFor="q" className="field-label">Search titles</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
                  <input id="q" name="q" defaultValue={f.q} placeholder="AI, fest, design…" className="field pl-9" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                <div><label htmlFor="city" className="field-label">City</label><input id="city" name="city" defaultValue={f.city} placeholder="Hyderabad" className="field" /></div>
                <div><label htmlFor="country" className="field-label">Country</label><input id="country" name="country" defaultValue={f.country} placeholder="India" className="field" /></div>
              </div>
              <div><label htmlFor="category" className="field-label">Category</label><input id="category" name="category" defaultValue={f.category} placeholder="hackathon" className="field" /></div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                <div>
                  <label htmlFor="format" className="field-label">Format</label>
                  <select id="format" name="format" defaultValue={f.format ?? ""} className="field">
                    <option value="">Any</option><option value="online">Online</option><option value="in_person">In person</option><option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="fee" className="field-label">Fee</label>
                  <select id="fee" name="fee" defaultValue={f.fee ?? ""} className="field">
                    <option value="">Any</option><option value="free">Free</option><option value="paid">Paid</option><option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="status" className="field-label">Registration</label>
                <select id="status" name="status" defaultValue={f.status ?? ""} className="field">
                  <option value="">Any</option><option value="open">Open</option><option value="upcoming">Opens soon</option><option value="unknown">Unknown</option>
                </select>
              </div>
              <label className="flex items-center gap-3 rounded-lg border border-line bg-raised px-3 py-2.5 text-sm">
                <input type="checkbox" name="prize" value="1" defaultChecked={!!f.prize} className="check" /> Only prize-money events
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="from" className="field-label">Starts after</label><input id="from" name="from" type="date" defaultValue={f.from} className="field" /></div>
                <div><label htmlFor="to" className="field-label">Before</label><input id="to" name="to" type="date" defaultValue={f.to} className="field" /></div>
              </div>
              <div className="flex gap-2 pt-1">
                <button className="btn btn-primary flex-1">Apply</button>
                <Link href="/events" className="btn btn-quiet">Reset</Link>
              </div>
            </form>
          </FilterPanel>
        </aside>

        <section aria-label="Results" aria-live="polite">
          {Object.keys(filters).length > 0 && (
            <ul className="mb-5 flex flex-wrap gap-2" aria-label="Active filters">
              {Object.entries(filters).map(([k, v]) => (
                <li key={k}>
                  <Link href={href({ [k]: undefined, page: undefined })} className="pill hover:border-line-strong hover:text-text" aria-label={`Remove ${LABELS[k as Key]} filter`}>
                    {LABELS[k as Key]}{k === "prize" ? "" : `: ${v}`} <X aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {error && <Notice tone="bad">Could not load events right now. Please refresh or try again in a moment.</Notice>}
          {!error && events.length === 0 && (
            <EmptyState icon={Radar} title="Nothing on the radar here yet">
              No open events match these filters. Try removing one, or check back after the next scan.
              <div className="mt-5"><Link href="/events" className="btn btn-ghost">Clear filters</Link></div>
            </EmptyState>
          )}

          <ul className="grid gap-4 md:grid-cols-2">
            {events.map((e, i) => <li key={e.id}><EventCard e={e} i={i} /></li>)}
          </ul>

          {pages > 1 && (
            <nav className="mt-10 flex items-center justify-between gap-3" aria-label="Pagination">
              {page > 1 ? <Link className="btn btn-ghost" href={href({ page: String(page - 1) })}><ChevronLeft aria-hidden="true" /> Previous</Link> : <span />}
              <span className="font-mono text-sm text-faint">Page {page} / {pages}</span>
              {page < pages ? <Link className="btn btn-ghost" href={href({ page: String(page + 1) })}>Next <ChevronRight aria-hidden="true" /></Link> : <span />}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}

function clean(f: Filters) {
  return Object.fromEntries(FILTER_KEYS.filter((k) => f[k]).map((k) => [k, f[k]!])) as Partial<Record<Key, string>>;
}
