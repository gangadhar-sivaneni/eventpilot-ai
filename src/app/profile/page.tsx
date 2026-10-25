import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Bookmark, Download, ListChecks, Trash2, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PROFILE_FIELDS, PROFILE_GROUPS } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { Notice, PageHeader } from "@/components/ui";
import { DeleteAccountSection } from "@/components/delete-account-section";
import { deleteAnswer, deleteSavedSearch, saveAnswer, savePreferences, saveProfile } from "./actions";

export const metadata: Metadata = { title: "Profile" };

const SECTIONS = [
  ["details", "Details", UserRound],
  ["alerts", "Interests & alerts", Bell],
  ["answers", "Saved answers", ListChecks],
  ["searches", "Saved searches", Bookmark],
  ["data", "Your data", Download],
] as const;

const ALERTS: [string, string, string][] = [
  ["alert_new_event", "New matching events", "As soon as the agent finds one"],
  ["alert_registration_opened", "Registration opened", "For events you follow"],
  ["alert_deadline_reminder", "Deadline reminders", "24 hours before closing"],
  ["alert_availability_changed", "Availability changed", "Closed, reopened, or moved"],
  ["email_alerts", "Email digest", "At most one email every 2 hours"],
];

const SAVED: Record<string, string> = {
  profile: "Profile saved.", preferences: "Interests and alerts saved.", answer: "Saved answers updated.", search: "Saved search removed.",
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { supabase, user } = await requireUser();
  const { saved, error } = await searchParams;
  const [{ data: p }, { data: prefs }, { data: answers }, { data: searches }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("user_preferences").select("*").eq("user_id", user.id).single(),
    supabase.from("registration_answers").select("id, question, answer").order("question"),
    supabase.from("saved_searches").select("id, name, filters").order("created_at", { ascending: false }),
  ]);
  const filled = PROFILE_FIELDS.filter((f) => p?.[f.key] != null && p?.[f.key] !== "").length;
  const pct = Math.round((filled / PROFILE_FIELDS.length) * 100);

  return (
    <div className="shell py-10">
      <PageHeader eyebrow="Account" title="Your profile">
        Your profile details are securely encrypted and used exclusively to prepare event registration forms you approve.
      </PageHeader>

      <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <p className="eyebrow">Ready for forms</p>
            <p className="mt-2 font-display text-4xl font-bold tabular-nums">{pct}%</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
              <div className="grow-x h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 text-sm text-faint">{filled} of {PROFILE_FIELDS.length} details filled. More details means fewer questions for you.</p>
          </div>
          <nav aria-label="Profile sections" className="mt-4 hidden lg:block">
            <ul className="space-y-1">
              {SECTIONS.map(([id, label, Icon]) => (
                <li key={id}>
                  <a href={`#${id}`} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-dim transition-colors hover:bg-surface hover:text-text">
                    <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="space-y-8">
          {saved && SAVED[saved] && <Notice tone="ok">{SAVED[saved]}</Notice>}
          {error && <Notice tone="bad">{error}</Notice>}

          <section id="details" className="card scroll-mt-24 p-6 sm:p-8" aria-labelledby="h-details">
            <h2 id="h-details" className="text-2xl font-semibold">Details</h2>
            <p className="mt-1 text-sm text-faint">Signed in as {p?.email}. Verified account email cannot be changed here.</p>
            <form action={saveProfile} className="mt-6 space-y-8">
              {PROFILE_GROUPS.map((g) => (
                <fieldset key={g}>
                  <legend className="eyebrow mb-4">{g}</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {PROFILE_FIELDS.filter((f) => f.group === g).map((f) => (
                      <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
                        <label htmlFor={f.key} className="field-label">{f.label}</label>
                        {f.type === "select" ? (
                          <select id={f.key} name={f.key} defaultValue={p?.[f.key] ?? ""} className="field">
                            <option value="">Not set</option>
                            {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        ) : f.type === "textarea" ? (
                          <textarea id={f.key} name={f.key} rows={3} maxLength={f.max} defaultValue={p?.[f.key] ?? ""} className="field" />
                        ) : (
                          <input id={f.key} name={f.key} type={f.type} maxLength={f.max} autoComplete={f.autoComplete}
                            defaultValue={p?.[f.key] ?? ""} className="field" inputMode={f.type === "number" ? "numeric" : undefined} />
                        )}
                      </div>
                    ))}
                  </div>
                </fieldset>
              ))}
              <SubmitButton pendingText="Saving…">Save details</SubmitButton>
            </form>
          </section>

          <section id="alerts" className="card scroll-mt-24 p-6 sm:p-8" aria-labelledby="h-alerts">
            <h2 id="h-alerts" className="text-2xl font-semibold">Interests &amp; alerts</h2>
            <p className="mt-1 text-sm text-faint">Leave a box empty to accept anything. Online events match every city.</p>
            <form action={savePreferences} className="mt-6 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label htmlFor="categories" className="field-label">Categories</label>
                  <input id="categories" name="categories" defaultValue={prefs?.categories.join(", ")} placeholder="hackathon, ai, workshop" className="field" /></div>
                <div><label htmlFor="cities" className="field-label">Cities</label>
                  <input id="cities" name="cities" defaultValue={prefs?.cities.join(", ")} placeholder="Hyderabad, Bengaluru" className="field" /></div>
                <div><label htmlFor="countries" className="field-label">Countries</label>
                  <input id="countries" name="countries" defaultValue={prefs?.countries.join(", ")} placeholder="India" className="field" /></div>
                <div><label htmlFor="max_fee" className="field-label">Max fee (blank = any, 0 = free only)</label>
                  <input id="max_fee" name="max_fee" type="number" min={0} step="any" defaultValue={prefs?.max_fee ?? ""} className="field" /></div>
              </div>
              <fieldset>
                <legend className="field-label">Formats</legend>
                <div className="flex flex-wrap gap-2">
                  {[["online", "Online"], ["in_person", "In person"], ["hybrid", "Hybrid"]].map(([v, l]) => (
                    <label key={v} className="flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-sm has-[:checked]:border-signal has-[:checked]:text-text">
                      <input type="checkbox" name="formats" value={v} defaultChecked={prefs?.formats.includes(v)} className="check" /> {l}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="field-label">Alerts</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Toggle name="prize_only" title="Prize money only" hint="Hide events without a cash prize" checked={prefs?.prize_only} />
                  {ALERTS.map(([k, t, h]) => <Toggle key={k} name={k} title={t} hint={h} checked={prefs?.[k]} />)}
                </div>
              </fieldset>
              <SubmitButton pendingText="Saving…">Save interests</SubmitButton>
            </form>
          </section>

          <section id="answers" className="card scroll-mt-24 p-6 sm:p-8" aria-labelledby="h-answers">
            <h2 id="h-answers" className="text-2xl font-semibold">Saved answers</h2>
            <p className="mt-1 text-sm text-faint">Filled in only when a form asks exactly this question (case and punctuation ignored).</p>
            <ul className="mt-6 space-y-3">
              {(answers ?? []).map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-4 rounded-xl border border-line bg-raised p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{a.question}</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-dim">{a.answer}</p>
                  </div>
                  <form action={deleteAnswer}>
                    <input type="hidden" name="id" value={a.id} />
                    <SubmitButton className="btn btn-quiet btn-sm" pendingText="…"><Trash2 aria-hidden="true" /><span className="sr-only">Delete answer</span></SubmitButton>
                  </form>
                </li>
              ))}
              {answers?.length === 0 && <li className="text-dim">No saved answers yet. Add the questions forms usually ask you.</li>}
            </ul>
            <form action={saveAnswer} className="mt-6 grid gap-4 border-t border-line pt-6">
              <div><label htmlFor="question" className="field-label">Question, as forms phrase it</label>
                <input id="question" name="question" required minLength={3} maxLength={300} placeholder="Why do you want to attend?" className="field" /></div>
              <div><label htmlFor="answer" className="field-label">Your answer</label>
                <textarea id="answer" name="answer" rows={3} maxLength={4000} required className="field" /></div>
              <div><SubmitButton className="btn btn-ghost" pendingText="Adding…">Add answer</SubmitButton></div>
            </form>
          </section>

          <section id="searches" className="card scroll-mt-24 p-6 sm:p-8" aria-labelledby="h-searches">
            <h2 id="h-searches" className="text-2xl font-semibold">Saved searches</h2>
            <ul className="mt-5 space-y-2">
              {(searches ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-raised px-4 py-2.5">
                  <Link className="link truncate" href={`/events?${new URLSearchParams(s.filters)}`}>{s.name}</Link>
                  <form action={deleteSavedSearch}>
                    <input type="hidden" name="id" value={s.id} />
                    <SubmitButton className="btn btn-quiet btn-sm" pendingText="…"><Trash2 aria-hidden="true" /><span className="sr-only">Delete saved search</span></SubmitButton>
                  </form>
                </li>
              ))}
              {searches?.length === 0 && <li className="text-dim">Filter the <Link href="/events" className="link">events list</Link> and press Save to keep a search.</li>}
            </ul>
          </section>

          <section id="data" className="card scroll-mt-24 p-6 sm:p-8" aria-labelledby="h-data">
            <h2 id="h-data" className="text-2xl font-semibold">Your data</h2>
            <p className="mt-1 text-sm text-faint">Everything we store about you, yours to take or erase.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-line bg-raised p-5">
                <Download className="h-5 w-5 text-accent" aria-hidden="true" />
                <p className="mt-3 font-medium">Download a copy</p>
                <p className="mt-1 text-sm text-dim">Profile, answers, alerts and registrations as JSON.</p>
                <a href="/profile/export" className="btn btn-ghost mt-4">Download JSON</a>
              </div>
              <DeleteAccountSection />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Toggle({ name, title, hint, checked }: { name: string; title: string; hint: string; checked?: boolean }) {
  return (
    <label className="group flex items-center justify-between gap-4 rounded-xl border border-line bg-raised p-4 transition-colors has-[:checked]:border-signal/50">
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-faint">{hint}</span>
      </span>
      <span className="relative flex-none">
        <input type="checkbox" name={name} defaultChecked={checked} className="peer sr-only" />
        <span aria-hidden="true" className="block h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-signal peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal" />
        <span aria-hidden="true" className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-text shadow transition-transform duration-200 [transition-timing-function:var(--ease-spring)] peer-checked:translate-x-5 peer-checked:bg-signal-ink" />
      </span>
    </label>
  );
}
