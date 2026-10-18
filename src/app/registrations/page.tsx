import type { Metadata } from "next";
import Link from "next/link";
import { Check, CircleAlert, ClipboardList, Terminal, X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { MANUAL_KINDS, unresolved, type Proposed } from "@/lib/registrations";
import { LocalTime } from "@/components/local-time";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, FeePill, Notice, PageHeader } from "@/components/ui";
import { approve, cancel, revokeApproval, saveAnswers } from "./actions";

export const metadata: Metadata = { title: "Registrations" };

const STEPS = ["Prepared", "Your review", "Submitted", "Confirmed"];
const STEP_OF: Record<string, number> = { not_started: -1, prepared: 0, awaiting_approval: 1, submitted: 2, unknown: 2, failed: 0, confirmed: 3 };

const NEXT_STEP: Record<string, string> = {
  not_started: "Run the agent on your computer to read this form.",
  prepared: "The agent stopped on questions it would not guess. Answer the flagged ones below, or add saved answers and prepare again.",
  awaiting_approval: "Review every answer below. Approve only if all of it is correct.",
  submitted: "Submitted. Waiting for a confirmation signal; this is not a success yet.",
  confirmed: "Registered. Keep the evidence below.",
  failed: "The attempt failed. Read the error, fix it, and prepare again.",
  unknown: "The outcome is unclear. Check your email and the event page. The agent will not resubmit automatically.",
};

const SOURCE: Record<string, [string, string]> = {
  needs_user: ["Needs you", "pill-warn"], consent: ["Your consent", "pill-flare"], manual: ["Do it yourself", ""],
  "saved answer": ["Saved answer", "pill-sky"], user_edit: ["Edited by you", "pill-signal"],
};

type Ev = { id: number; title: string; fee_status: "free" | "paid" | "unknown"; fee_amount: number | null; fee_currency: string | null; registration_deadline: string | null };

export default async function RegistrationsPage() {
  const { supabase } = await requireUser();
  const { data: regs, error } = await supabase
    .from("registrations")
    .select("*, events(id, title, fee_status, fee_amount, fee_currency, registration_deadline)")
    .order("updated_at", { ascending: false });

  return (
    <div className="shell py-10">
      <PageHeader eyebrow="Agent" title="Registrations">
        The agent prepares, you approve, and only a real confirmation counts as success.
      </PageHeader>

      <div className="mt-8 space-y-6">
        {error && <Notice tone="bad">Could not load registrations.</Notice>}
        {regs?.length === 0 && (
          <EmptyState icon={ClipboardList} title="No registrations yet">
            Open an event and choose <b className="text-text">Prepare my registration</b>. It will show up here.
            <div className="mt-5"><Link href="/events" className="btn btn-ghost">Browse events</Link></div>
          </EmptyState>
        )}

        {(regs ?? []).map((r, idx) => {
          const ev = r.events as Ev;
          const answers = r.proposed_answers as Proposed[];
          const blocking = unresolved(answers);
          const editable = ["prepared", "awaiting_approval"].includes(r.status);
          const step = STEP_OF[r.status];
          const broken = r.status === "failed" || r.status === "unknown";
          const command = r.approved_at && editable ? `submit ${r.id}` : ["not_started", "prepared", "failed"].includes(r.status) ? `prepare ${r.id}` : null;
          return (
            <article key={r.id} className="rise card overflow-hidden" style={{ "--i": idx } as React.CSSProperties}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5 sm:p-6">
                <div className="min-w-0">
                  <Link href={`/events/${ev.id}`} className="font-display text-xl font-semibold hover:text-accent">{ev.title}</Link>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-faint">
                    <span className="font-mono">#{r.id}</span>· deadline <LocalTime iso={ev.registration_deadline} relative /> · {r.attempt_count} attempt{r.attempt_count === 1 ? "" : "s"}
                  </p>
                </div>
                <FeePill e={ev} />
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <ol className="grid grid-cols-4 gap-2" aria-label={`Progress: ${r.status.replaceAll("_", " ")}`}>
                  {STEPS.map((s, i) => {
                    const done = i < step || (i === step && r.status === "confirmed");
                    const current = i === step && r.status !== "confirmed";
                    return (
                      <li key={s} className="min-w-0">
                        <span className={`block h-1.5 rounded-full ${done ? "bg-signal" : current ? (broken ? "bg-bad" : "bg-signal/50") : "bg-raised"}`} />
                        <span className={`mt-2 flex items-center gap-1 truncate text-xs ${done || current ? "text-text" : "text-faint"}`}>
                          {done && <Check className="h-3.5 w-3.5 text-accent" aria-hidden="true" />}
                          {current && broken && <X className="h-3.5 w-3.5 text-bad" aria-hidden="true" />}
                          {s}
                        </span>
                      </li>
                    );
                  })}
                </ol>

                <p className="text-dim">{NEXT_STEP[r.status]}</p>
                {r.error_summary && <Notice tone="bad">{r.error_summary}</Notice>}
                {r.evidence && <Notice tone="ok">Evidence: {r.evidence}</Notice>}

                {command && (
                  <div className="on-dark flex items-center gap-3 overflow-x-auto rounded-xl border border-line px-4 py-3 font-mono text-[0.8rem]">
                    <Terminal className="h-4 w-4 flex-none text-accent" aria-hidden="true" />
                    <code className="whitespace-nowrap text-dim">python worker/registration.py <span className="text-text">{command}</span></code>
                  </div>
                )}

                {blocking.length > 0 && (
                  <div className="rounded-xl border border-warn/30 bg-warn/5 p-4">
                    <p className="flex items-center gap-2 font-medium text-warn"><CircleAlert className="h-4 w-4" aria-hidden="true" /> Needs you before approval</p>
                    <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-dim">{blocking.map((u) => <li key={u}>{u}</li>)}</ul>
                  </div>
                )}

                {answers.length > 0 && (
                  <form action={saveAnswers} className="space-y-4">
                    <input type="hidden" name="id" value={r.id} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      {answers.map((a, i) => <AnswerField key={i} a={a} name={`value_${i}`} disabled={!editable} />)}
                    </div>
                    {editable && <SubmitButton className="btn btn-ghost" pendingText="Saving…">Save answers</SubmitButton>}
                  </form>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
                  {editable && !r.approved_at && blocking.length === 0 && (
                    <form action={approve} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="id" value={r.id} />
                      {ev.fee_status !== "free" && (
                        <>
                          <input name="fee" type="number" min={0} step="any" required aria-label="Fee you agree to pay" placeholder="Fee amount" className="field w-36" />
                          <label className="flex items-center gap-2 text-sm text-dim">
                            <input type="checkbox" name="fee_terms" required className="check" /> I agree to pay this and accept the event terms
                          </label>
                        </>
                      )}
                      <SubmitButton pendingText="Approving…"><Check aria-hidden="true" /> Approve submission</SubmitButton>
                    </form>
                  )}
                  {r.approved_at && editable && (
                    <>
                      <span className="pill pill-ok"><Check aria-hidden="true" /> Approved <LocalTime iso={r.approved_at} relative /></span>
                      <form action={revokeApproval}>
                        <input type="hidden" name="id" value={r.id} />
                        <SubmitButton className="btn btn-quiet btn-sm" pendingText="…">Revoke</SubmitButton>
                      </form>
                    </>
                  )}
                  {["not_started", "prepared", "awaiting_approval", "failed"].includes(r.status) && (
                    <form action={cancel} className="ml-auto">
                      <input type="hidden" name="id" value={r.id} />
                      <SubmitButton className="btn btn-quiet btn-sm" pendingText="Cancelling…">Cancel</SubmitButton>
                    </form>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function AnswerField({ a, name, disabled }: { a: Proposed; name: string; disabled: boolean }) {
  const [text, tone] = SOURCE[a.source] ?? (a.source.startsWith("profile") ? ["From profile", "pill-ok"] : [a.source, ""]);
  const source = <span className={`pill shrink-0 ${tone}`}>{text}</span>;
  const head = (forId?: string) => (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <label htmlFor={forId} className="min-w-0 truncate text-sm font-medium text-dim">{a.label}{a.required && <span className="text-bad"> *</span>}</label>
      {source}
    </div>
  );
  if (MANUAL_KINDS.has(a.kind))
    return <div className="rounded-xl border border-line bg-raised p-4 text-sm">{head()}<p className="text-faint">Do this yourself on the official page.</p></div>;
  if (a.kind === "consent")
    return (
      <div className="rounded-xl border border-flare/30 bg-flare/5 p-4 sm:col-span-2">
        {head()}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name={name} value="yes" defaultChecked={a.value === "yes"} disabled={disabled} className="check mt-0.5" />
          I have read this and agree: {a.label}
        </label>
      </div>
    );
  if (a.kind === "checkbox")
    return (
      <fieldset className="sm:col-span-2">
        <legend className="w-full">{head()}</legend>
        <div className="flex flex-wrap gap-2">
          {(a.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-sm">
              <input type="checkbox" name={name} value={o} defaultChecked={a.value.split(";").includes(o)} disabled={disabled} className="check" /> {o}
            </label>
          ))}
        </div>
      </fieldset>
    );
  const id = `${name}-${a.label}`.replace(/\W+/g, "-");
  return (
    <div className={a.kind === "textarea" ? "sm:col-span-2" : ""}>
      {head(id)}
      {a.kind === "radio" || a.kind === "select" ? (
        <select id={id} name={name} defaultValue={a.value} disabled={disabled} className="field">
          <option value="">Choose…</option>
          {(a.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : a.kind === "textarea" ? (
        <textarea id={id} name={name} rows={3} defaultValue={a.value} disabled={disabled} className="field" />
      ) : (
        <input id={id} name={name} defaultValue={a.value} disabled={disabled} className="field"
          type={["email", "tel", "url", "number", "date"].includes(a.kind) ? a.kind : "text"} />
      )}
    </div>
  );
}
