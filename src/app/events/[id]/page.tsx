import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Building2, Clock, FileText, ShieldCheck, Tag, Trophy } from "lucide-react";
import { getUser } from "@/lib/auth";
import { EVENT_COLUMNS, safeOfficialUrl, safeRegistrationUrl, sourceName, type EventRow } from "@/lib/events";
import { LocalTime } from "@/components/local-time";
import { LoginButton } from "@/components/login-button";
import { SubmitButton } from "@/components/submit-button";
import { FeePill, PlacePill, StatusPill } from "@/components/ui";
import { startRegistration } from "../actions";

async function load(id: string) {
  if (!/^\d+$/.test(id)) return null;
  const { supabase, user } = await getUser();
  const nowIso = new Date().toISOString();
  const freshSince = new Date(Date.parse(nowIso) - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from("events").select(EVENT_COLUMNS)
    .not("quality_verified_at", "is", null).not("registration_url", "is", null)
    .gte("quality_verified_at", freshSince).gte("last_checked_at", freshSince)
    .gt("starts_at", nowIso).eq("id", Number(id)).maybeSingle();
  return data ? { e: data as EventRow, user, now: Date.now() } : null; // request time, read alongside the data
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const found = await load((await params).id);
  return { title: found?.e.title ?? "Event" };
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const found = await load((await params).id);
  if (!found) notFound();
  const { e, user, now } = found;
  const officialUrl = safeOfficialUrl(e);
  const regUrl = safeRegistrationUrl(e);
  const milestones = [
    ["Registration opens", e.registration_opens_at],
    ["Registration closes", e.registration_deadline],
    ["Event starts", e.starts_at],
    ["Event ends", e.ends_at],
  ] as const;
  const nextIndex = milestones.findIndex(([, iso]) => iso && new Date(iso).getTime() > now);

  return (
    <div className="shell py-10">
      <Link href="/events" className="btn btn-quiet -ml-3"><ArrowLeft aria-hidden="true" /> All events</Link>

      <header className="mt-4 border-b border-line pb-8">
        <div className="rise flex flex-wrap items-center gap-2">
          <StatusPill status={e.registration_status} />
          <FeePill e={e} />
          {e.prize_text && (
            <span className="pill pill-flare max-w-full overflow-hidden" title={e.prize_text}>
              <Trophy className="shrink-0" aria-hidden="true" />
              <span className="truncate">{e.prize_text}</span>
            </span>
          )}
        </div>
        <h1 className="rise mt-5 max-w-4xl text-4xl font-bold sm:text-5xl" style={{ "--i": 1 } as React.CSSProperties}>{e.title}</h1>
        <div className="rise mt-4 flex flex-wrap items-center gap-x-6 gap-y-2" style={{ "--i": 2 } as React.CSSProperties}>
          <span className="inline-flex items-center gap-1.5 text-sm text-dim"><Building2 className="h-4 w-4 text-faint" aria-hidden="true" /> {e.organizer ?? "Organizer not listed"}</span>
          <PlacePill e={e} />
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="card p-6" aria-labelledby="timeline">
            <h2 id="timeline" className="text-xl font-semibold">Timeline</h2>
            <ol className="mt-6 space-y-0">
              {milestones.map(([label, iso], i) => {
                const past = iso && new Date(iso).getTime() <= now;
                const isNext = i === nextIndex;
                return (
                  <li key={label} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < milestones.length - 1 && <span aria-hidden="true" className="absolute left-[7px] top-5 h-full w-px bg-line" />}
                    <span aria-hidden="true" className={`relative mt-1 h-4 w-4 flex-none rounded-full border-2 ${
                      isNext ? "ping border-signal bg-signal" : past ? "border-line-strong bg-line-strong" : "border-line-strong bg-ink"}`} />
                    <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4">
                      <p className={past ? "text-faint" : "font-medium"}>{label}{isNext && <span className="ml-2 font-mono text-xs text-accent">next</span>}</p>
                      <p className="text-sm text-dim">
                        <LocalTime iso={iso} />
                        {iso && !past && <span className="ml-2 text-faint">(<LocalTime iso={iso} relative />)</span>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="card grid gap-6 p-6 sm:grid-cols-2" aria-label="Details">
            <div>
              <p className="eyebrow">Eligibility</p>
              <p className="mt-2 text-dim">{e.eligibility ?? "Not listed. Check the official page before applying."}</p>
            </div>
            <div>
              <p className="eyebrow">Categories</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.categories.length ? e.categories.map((c) => (
                  <Link key={c} href={`/events?category=${encodeURIComponent(c)}`} className="pill hover:text-text"><Tag aria-hidden="true" />{c}</Link>
                )) : <span className="text-faint">None</span>}
              </div>
            </div>
            <div>
              <p className="eyebrow">Source</p>
              <p className="mt-2 font-medium text-accent">{sourceName(e)}</p>
            </div>
            <div>
              <p className="eyebrow">Last checked</p>
              <p className="mt-2 text-dim"><LocalTime iso={e.last_checked_at} relative /></p>
            </div>
          </section>

          {e.description && (
            <section className="card p-6" aria-labelledby="about">
              <h2 id="about" className="flex items-center gap-2 text-xl font-semibold"><FileText className="h-5 w-5 text-faint" aria-hidden="true" /> About</h2>
              <p className="mt-4 whitespace-pre-line text-dim">{e.description.slice(0, 2000)}</p>
            </section>
          )}
        </div>

        <aside className="order-first lg:order-none lg:sticky lg:top-24 lg:self-start">
          <div className="card space-y-5 p-6">
            <div>
              <p className="eyebrow">Deadline</p>
              <p className="mt-2 flex items-center gap-2 font-display text-2xl font-bold">
                <Clock className="h-5 w-5 text-accent" aria-hidden="true" />
                {e.registration_deadline ? <LocalTime iso={e.registration_deadline} relative /> : "Not announced"}
              </p>
            </div>
            <div className="space-y-3">
              {user ? (
                <form action={startRegistration}>
                  <input type="hidden" name="event_id" value={e.id} />
                  <SubmitButton className="btn btn-primary w-full" pendingText="Starting…">Prepare my registration</SubmitButton>
                </form>
              ) : (
                <div className="[&>button]:w-full"><LoginButton next={`/events/${e.id}`} label="Log in to prepare" /></div>
              )}
              {officialUrl && (
                <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost w-full">
                  {regUrl === officialUrl ? "Event & registration page" : "Official event page"} <ArrowUpRight aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
              {regUrl && regUrl !== officialUrl && (
                <a href={regUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost w-full">
                  Official registration <ArrowUpRight aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </div>
            <p className="flex gap-2 border-t border-line pt-4 text-xs text-faint">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-ok" aria-hidden="true" />
              Verified official listing. The agent auto-prepares your answers and requires your confirmation before submitting.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
