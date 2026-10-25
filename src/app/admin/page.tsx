import type { Metadata } from "next";
import { Activity, Copy, Database, Play } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { triggerScanAction } from "./actions";

export const metadata: Metadata = { title: "Admin" };

// Admin = app_metadata.role "admin" (set in SQL, see README). RLS enforces it too.
export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  const [{ data: sources }, { data: jobs }, { data: recent }] = await Promise.all([
    supabase.from("event_sources").select("*").order("key"),
    supabase.from("automation_jobs").select("*").order("started_at", { ascending: false }).limit(30),
    supabase.from("events").select("id, title, url, starts_at").order("first_seen_at", { ascending: false }).limit(2000),
  ]);

  // suspected duplicates: same normalized title and start day, different URL
  const groups = new Map<string, { id: number; url: string }[]>();
  for (const e of recent ?? []) {
    const k = `${e.title.toLowerCase().replace(/[^a-z0-9]/g, "")}|${e.starts_at?.slice(0, 10) ?? ""}`;
    groups.set(k, [...(groups.get(k) ?? []), { id: e.id, url: e.url }]);
  }
  const dupes = [...groups.entries()].filter(([, v]) => v.length > 1).slice(0, 50);
  const tone = (s: string) => (s === "succeeded" ? "pill-ok" : s === "running" ? "pill-warn" : "pill-bad");

  return (
    <div className="shell space-y-8 py-10">
      <PageHeader
        eyebrow="Operations"
        title="Admin"
        actions={
          <form action={triggerScanAction}>
            <SubmitButton className="btn btn-primary" pendingText="Dispatching scan…">
              <Play className="h-4 w-4" aria-hidden="true" /> Trigger Scan Now
            </SubmitButton>
          </form>
        }
      >
        Source health, worker runs and catalogue quality.
      </PageHeader>

      <section className="card overflow-hidden" aria-labelledby="h-sources">
        <h2 id="h-sources" className="flex items-center gap-2 border-b border-line px-6 py-4 text-lg font-semibold"><Database className="h-5 w-5 text-accent" aria-hidden="true" /> Source health</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Source</th><th>State</th><th>Last success</th><th>Last run</th><th>Last error</th></tr></thead>
            <tbody>
              {(sources ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}<p className="font-mono text-xs text-faint">{s.key}</p></td>
                  <td><span className={`pill ${!s.enabled ? "" : s.last_error ? "pill-bad" : s.last_success_at ? "pill-ok" : "pill-warn"}`}>
                    {!s.enabled ? "disabled" : s.last_error ? "failing" : s.last_success_at ? "healthy" : "never run"}</span></td>
                  <td><LocalTime iso={s.last_success_at} fallback="never" relative /></td>
                  <td className="font-mono text-xs text-dim">{Object.entries(s.last_counts ?? {}).map(([k, v]) => `${k} ${v}`).join(" · ") || "–"}</td>
                  <td className="max-w-xs text-bad">{s.last_error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden" aria-labelledby="h-jobs">
        <h2 id="h-jobs" className="flex items-center gap-2 border-b border-line px-6 py-4 text-lg font-semibold"><Activity className="h-5 w-5 text-accent" aria-hidden="true" /> Recent jobs</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Kind</th><th>Scope</th><th>Status</th><th>Started</th><th>Counts</th><th>Error</th></tr></thead>
            <tbody>
              {(jobs ?? []).map((j) => (
                <tr key={j.id}>
                  <td className="font-medium">{j.kind}</td><td className="font-mono text-xs">{j.scope || "–"}</td>
                  <td><span className={`pill ${tone(j.status)}`}>{j.status}</span></td>
                  <td><LocalTime iso={j.started_at} relative /></td>
                  <td className="font-mono text-xs text-dim">{Object.entries(j.counts ?? {}).map(([k, v]) => `${k} ${v}`).join(" · ") || "–"}</td>
                  <td className="max-w-xs text-bad">{j.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-6" aria-labelledby="h-dupes">
        <h2 id="h-dupes" className="flex items-center gap-2 text-lg font-semibold"><Copy className="h-5 w-5 text-accent" aria-hidden="true" /> Suspected duplicates</h2>
        {dupes.length === 0 && <p className="mt-3 text-dim">None found.</p>}
        <ul className="mt-4 space-y-2 text-sm">
          {dupes.map(([k, v]) => (
            <li key={k} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2">
              {v.map((e) => <a key={e.id} href={`/events/${e.id}`} className="pill hover:text-text">#{e.id}</a>)}
              <span className="truncate text-faint">{v[0].url}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
