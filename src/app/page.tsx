import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, Ban, BellRing, CircleCheck, Download, FileText, Hand, Lock, Radar as RadarIcon,
  ScanSearch, ShieldCheck, Trophy, UserRound, Wallet,
} from "lucide-react";
import { getUser } from "@/lib/auth";
import { EVENT_COLUMNS, sourceName, type EventRow } from "@/lib/events";
import { Radar } from "@/components/radar";
import { LoginButton } from "@/components/login-button";
import { LocalTime } from "@/components/local-time";
import { Notice, PlacePill, PrizePill, StatusPill } from "@/components/ui";

const SOURCES = ["Devpost", "Unstop", "Devfolio", "Luma", "StudentTribe", "Major League Hacking", "HackerEarth", "Google Developer Groups"];

const STEPS = [
  { icon: ScanSearch, title: "Discover", text: "The agent checks event sources every 10 minutes and keeps event dates separate from registration deadlines." },
  { icon: BellRing, title: "Match", text: "Your interests, cities and fee limit decide what reaches you, in-app and by email." },
  { icon: FileText, title: "Prepare", text: "It reads the form and fills only what maps exactly to your profile. Everything else, it asks." },
  { icon: Hand, title: "You approve", text: "Nothing is sent until you review it. Success is recorded only with a real confirmation." },
];

const PROMISES = [
  { title: "Autonomous Discovery", desc: "Crawls and indexes tech hackathons, conferences, and student fests around the clock." },
  { title: "Zero Hallucination Policy", desc: "Every date, deadline, prize, and registration link is verified directly from official source pages." },
  { title: "Complete User Control", desc: "The agent prepares application questions accurately, but you review and give final approval." },
  { title: "Privacy & Data Ownership", desc: "Your personal details and profile answers stay strictly yours, encrypted and fully exportable." },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; deleted?: string }> }) {
  const { supabase, user } = await getUser();
  const { next, error, deleted } = await searchParams;
  const nowIso = new Date().toISOString();
  const freshSince = new Date(Date.parse(nowIso) - 24 * 60 * 60 * 1000).toISOString();

  // Real numbers only: if the catalogue is unreachable the band is hidden rather than faked.
  const [all, prize, latest, picks] = await Promise.all([
    supabase.from("events").select("id", { count: "exact", head: true }).not("quality_verified_at", "is", null)
      .gte("last_checked_at", freshSince).or(`starts_at.gte.${nowIso},ends_at.gte.${nowIso}`).neq("registration_status", "closed"),
    supabase.from("events").select("id", { count: "exact", head: true }).not("quality_verified_at", "is", null)
      .gte("last_checked_at", freshSince).or(`starts_at.gte.${nowIso},ends_at.gte.${nowIso}`).neq("registration_status", "closed").not("prize_text", "is", null),
    supabase.from("events").select("last_checked_at").not("quality_verified_at", "is", null)
      .gte("last_checked_at", freshSince).order("last_checked_at", { ascending: false }).limit(1),
    supabase.from("events").select(EVENT_COLUMNS).not("quality_verified_at", "is", null)
      .gte("last_checked_at", freshSince).or(`starts_at.gte.${nowIso},ends_at.gte.${nowIso}`).neq("registration_status", "closed").not("prize_text", "is", null)
      .order("first_seen_at", { ascending: false }).limit(3),
  ]);
  const live = !all.error && (all.count ?? 0) > 0;
  const events = (picks.data ?? []) as EventRow[];
  const safeNext = next?.startsWith("/") ? next : "/events";

  return (
    <>
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_90_31/0.16),transparent)]" aria-hidden="true" />
        <div className="shell relative grid items-center gap-14 pb-20 pt-14 md:pt-20 lg:grid-cols-[1.05fr_1fr]">
          <div>
            {error && <div className="mb-6"><Notice tone="bad">Sign-in did not complete. Please try again.</Notice></div>}
            {deleted && <div className="mb-6"><Notice tone="ok">Your account and all of its data were deleted.</Notice></div>}
            <p className="rise inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-dim" style={{ "--i": 0 } as React.CSSProperties}>
              <span className="ping relative h-2 w-2 rounded-full bg-signal" aria-hidden="true" />
              Hyderabad & India tech events · online events included
            </p>
            <h1 className="mt-6 text-[2.75rem] font-extrabold leading-[1.02] sm:text-6xl lg:text-[4.4rem]">
              <span className="rise block" style={{ "--i": 1 } as React.CSSProperties}>Find tech events</span>
              <span className="rise block" style={{ "--i": 2 } as React.CSSProperties}><span className="marker">first.</span></span>
              <span className="rise block" style={{ "--i": 3 } as React.CSSProperties}>Fill every form right.</span>
            </h1>
            <p className="rise mt-6 max-w-xl text-lg text-dim" style={{ "--i": 4 } as React.CSSProperties}>
              EventPilot is your autonomous radar for technology hackathons, conferences, and fests across India and worldwide.
              Every listing is verified in real time with live deadlines, prize pools, and instant form prep.
            </p>
            <div className="rise mt-8 flex flex-wrap gap-3" style={{ "--i": 5 } as React.CSSProperties}>
              {user ? (
                <Link href="/events" className="btn btn-primary">Open your events <ArrowRight aria-hidden="true" /></Link>
              ) : (
                <LoginButton next={safeNext} label="Log in / Get started" />
              )}
              <Link href="/events?prize=1" className="btn btn-ghost"><Trophy aria-hidden="true" /> Prize-money events</Link>
            </div>
            <ul className="rise mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-dim" style={{ "--i": 6 } as React.CSSProperties}>
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" /> You approve every submission</li>
              <li className="flex items-center gap-2"><CircleCheck className="h-4 w-4 text-accent" aria-hidden="true" /> 100% verified official links</li>
              <li className="flex items-center gap-2"><Lock className="h-4 w-4 text-accent" aria-hidden="true" /> Encrypted & private data</li>
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-[34rem]">
            <div className="fade-in"><Radar /></div>
            <div className="absolute inset-0 flex flex-col justify-center gap-3 px-2 sm:px-0">
              {events.map((e, i) => (
                <Link
                  key={e.id}
                  href={`/events/${e.id}`}
                  className={`floaty card card-hover block w-[92%] bg-surface/90 p-3.5 backdrop-blur-md sm:w-[72%] sm:p-4 ${i === 1 ? "self-end" : i === 2 ? "sm:ml-[8%]" : ""}`}
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <div className="flex items-center justify-between gap-3">
                    <StatusPill status={e.registration_status} />
                    <span className="hidden truncate font-mono text-[0.7rem] font-medium text-accent sm:inline">{sourceName(e)}</span>
                  </div>
                  <p className="mt-2 line-clamp-1 font-display text-lg font-semibold">{e.title}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <PlacePill e={e} />
                    <PrizePill prize={e.prize_text} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Live numbers ─── */}
      {live && (
        <section aria-label="Live catalogue" className="on-dark">
          <dl className="shell grid grid-cols-2 gap-y-8 py-10 sm:grid-cols-3">
            {[
              ["Open events", (all.count ?? 0).toLocaleString()],
              ["With prize money", (prize.count ?? 0).toLocaleString()],
              ["Last scan", <LocalTime key="t" iso={latest.data?.[0]?.last_checked_at ?? null} relative />],
            ].map(([k, v], i) => (
              <div
                key={String(k)}
                className={`reveal border-l border-line pl-5 ${i === 2 ? "col-span-2 sm:col-span-1" : ""}`}
                style={{ "--i": i } as React.CSSProperties}
              >
                <dt className="eyebrow">{k}</dt>
                <dd className="mt-2 font-display text-3xl font-bold tabular-nums text-accent sm:text-4xl">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ─── Sources marquee ─── */}
      <section aria-label="Sources" className="overflow-hidden py-4">
        {/* the tilted band is wider than the screen on purpose; this straight wrapper clips it */}
        <div className="marquee-wrap -mx-4 -rotate-1 overflow-hidden border-y-2 border-text bg-signal py-4 sm:py-5">
          <div className="marquee flex w-max gap-10 pr-10 sm:gap-12 sm:pr-12">
            {[...SOURCES, ...SOURCES].map((s, i) => (
              <span key={i} aria-hidden={i >= SOURCES.length} className="flex items-center gap-10 font-display text-lg font-bold text-signal-ink sm:gap-12 sm:text-xl">
                {s}<span className="h-2 w-2 rotate-45 bg-signal-ink" />
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="w-full px-5 sm:px-8 md:px-12 lg:px-16 xl:px-24 py-20 md:py-28" aria-labelledby="how">
        <p className="eyebrow">How it works</p>
        <h2 id="how" className="mt-3 max-w-3xl text-4xl font-bold sm:text-5xl">From a listing to a confirmed seat, without the guesswork.</h2>
        <ol className="relative mt-14 grid grid-cols-1 md:grid-cols-4 gap-8 w-full">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="reveal relative flex flex-col" style={{ "--i": i } as React.CSSProperties}>
              <div className="relative flex items-center">
                <span className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-text bg-surface text-text shadow-[4px_4px_0_var(--signal)]">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>

                {/* Desktop horizontal line connecting to next step */}
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="grow-x hidden md:block absolute left-12 -right-10 top-1/2 -translate-y-1/2 h-0.5 z-0 pointer-events-none"
                    style={{
                      backgroundImage:
                        i === 0
                          ? "linear-gradient(to right, var(--signal), var(--signal))"
                          : i === 1
                          ? "linear-gradient(to right, var(--signal), var(--text))"
                          : "linear-gradient(to right, var(--text), var(--line-strong))",
                      animationDelay: `${250 + i * 200}ms`,
                    }}
                  />
                )}
              </div>

              <p className="mt-5 font-mono text-xs text-faint">0{i + 1}</p>
              <h3 className="mt-1 text-2xl font-semibold">{title}</h3>
              <p className="mt-2 text-dim text-sm sm:text-base leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ─── Features ─── */}
      <section className="shell" aria-labelledby="features">
        <p className="eyebrow">What you get</p>
        <h2 id="features" className="mt-3 max-w-2xl text-4xl font-bold sm:text-5xl">Built for the moment registration opens.</h2>
        <div className="mt-12 grid gap-4 md:grid-cols-6">
          <article className="on-dark reveal card card-hover p-7 md:col-span-3">
            <Trophy className="h-6 w-6 text-accent" aria-hidden="true" />
            <h3 className="mt-5 text-2xl font-semibold">Money events, first</h3>
            <p className="mt-2 text-dim">Prize pools are read from each listing and flagged, so cash events never get buried. Filter to them in one tap.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["AI", "Open source", "Cloud", "Cybersecurity"].map((p) => <span key={p} className="pill pill-flare">{p}</span>)}
            </div>
          </article>
          <article className="reveal card card-hover p-7 md:col-span-3">
            <BellRing className="h-6 w-6 text-accent" aria-hidden="true" />
            <h3 className="mt-5 text-2xl font-semibold">Alerts that respect you</h3>
            <p className="mt-2 text-dim">New matches, registration opening, deadlines within 24 hours. One email digest every 2 hours at most, never duplicates.</p>
            <ul className="mt-6 space-y-2 text-sm">
              {[["Registration opened", "pill-ok"], ["Closes within 24 hours", "pill-warn"], ["New match", "pill-signal"]].map(([t, c]) => (
                <li key={t} className="flex items-center justify-between rounded-lg border border-line bg-raised px-3 py-2"><span>{t}</span><span className={`pill ${c}`}>alert</span></li>
              ))}
            </ul>
          </article>
          <article className="reveal card card-hover p-7 md:col-span-4">
            <UserRound className="h-6 w-6 text-sky" aria-hidden="true" />
            <h3 className="mt-5 text-2xl font-semibold">A form agent that never guesses</h3>
            <p className="mt-2 text-dim">Each answer shows where it came from. Questions it cannot map exactly stop the run and come to you.</p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {[["Full name", "from profile", "pill-ok"], ["College email", "from profile", "pill-ok"], ["Why do you want to attend?", "saved answer", "pill-sky"], ["Team name", "needs you", "pill-warn"]].map(([l, s, c]) => (
                <div key={l} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-raised px-3 py-2.5 text-sm">
                  <span className="truncate">{l}</span><span className={`pill ${c}`}>{s}</span>
                </div>
              ))}
            </div>
          </article>
          <article className="reveal card card-hover p-7 md:col-span-2">
            <CircleCheck className="h-6 w-6 text-ok" aria-hidden="true" />
            <h3 className="mt-5 text-2xl font-semibold">Honest status</h3>
            <p className="mt-2 text-dim">Confirmed only with proof from the form. Unclear means unknown, never retried blindly.</p>
            <ol className="mt-6 space-y-2 font-mono text-xs">
              {["prepared", "approved", "submitted", "confirmed"].map((s, i) => (
                <li key={s} className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${i === 3 ? "bg-ok" : "bg-line-strong"}`} />{s}</li>
              ))}
            </ol>
          </article>
          <article className="reveal card card-hover p-7 md:col-span-2">
            <Wallet className="h-6 w-6 text-warn" aria-hidden="true" />
            <h3 className="mt-5 text-2xl font-semibold">Fees, out loud</h3>
            <p className="mt-2 text-dim">Free, paid or unknown, never assumed. Paid events need you to confirm the exact amount.</p>
          </article>
          <article className="reveal card card-hover p-7 md:col-span-4">
            <Download className="h-6 w-6 text-accent" aria-hidden="true" />
            <h3 className="mt-5 text-2xl font-semibold">Your data stays yours</h3>
            <p className="mt-2 max-w-xl text-dim">Protected per user in the database, downloadable as JSON, deletable in one step. No passwords or card numbers, ever.</p>
          </article>
        </div>
      </section>

      {/* ─── Guarantees ─── */}
      <section className="shell py-24" aria-labelledby="guarantees">
        <div className="on-dark reveal card grid gap-10 p-8 md:grid-cols-[1fr_1.3fr] md:p-12">
          <div>
            <p className="eyebrow">Our Standard</p>
            <h2 id="guarantees" className="mt-3 text-4xl font-bold">Built for excellence.</h2>
            <p className="mt-3 text-dim">Uncompromising accuracy and privacy. We verify every single opportunity directly at the source so you never miss out.</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PROMISES.map((p) => (
              <li key={p.title} className="flex items-start gap-3 rounded-xl border border-line bg-raised p-4">
                <CircleCheck className="mt-0.5 h-5 w-5 flex-none text-ok" aria-hidden="true" />
                <div>
                  <strong className="block text-sm font-semibold text-text">{p.title}</strong>
                  <span className="mt-1 block text-xs text-dim leading-relaxed">{p.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="shell">
        <div className="reveal relative overflow-hidden rounded-3xl border-2 border-text bg-signal px-8 py-16 text-center text-signal-ink shadow-[8px_8px_0_var(--text)] md:py-20">
          <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
          <RadarIcon className="relative mx-auto h-10 w-10" aria-hidden="true" />
          <h2 className="relative mx-auto mt-5 max-w-2xl text-4xl font-bold sm:text-5xl">Let the agent watch. You decide.</h2>
          <p className="relative mx-auto mt-4 max-w-lg font-medium">Set your interests once. Get the right events, and forms ready before the rush.</p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            {user ? <Link href="/profile" className="btn btn-dark">Set your interests <ArrowRight aria-hidden="true" /></Link> : <LoginButton next="/profile" label="Log in / Sign up" variant="dark" />}
            <Link href="/events" className="btn btn-ghost">Browse events <ArrowUpRight aria-hidden="true" /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
