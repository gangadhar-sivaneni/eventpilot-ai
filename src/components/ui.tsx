import { CircleAlert, CircleCheck, Globe, MapPin, Trophy, Wallet, type LucideIcon } from "lucide-react";
import type { EventRow } from "@/lib/events";

const STATUS: Record<EventRow["registration_status"], [string, string]> = {
  open: ["Registration open", "pill-ok"],
  upcoming: ["Opens soon", "pill-warn"],
  closed: ["Closed", "pill-bad"],
  unknown: ["Status unknown", ""],
};

export function StatusPill({ status }: { status: EventRow["registration_status"] }) {
  const [label, tone] = STATUS[status];
  return (
    <span className={`pill ${tone}`}>
      {status === "open" && <span className="ping relative h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />}
      {label}
    </span>
  );
}

export function FeePill({ e }: { e: Pick<EventRow, "fee_status" | "fee_amount" | "fee_currency"> }) {
  if (e.fee_status === "free") return <span className="pill pill-sky">Free</span>;
  if (e.fee_status === "paid")
    return (
      <span className="pill">
        <Wallet aria-hidden="true" />
        {e.fee_amount != null ? `${e.fee_currency ?? ""} ${e.fee_amount}`.trim() : "Paid"}
      </span>
    );
  return <span className="pill">Fee unknown</span>;
}

export function PrizePill({ prize }: { prize: string | null }) {
  if (!prize) return null;
  return (
    <span className="pill pill-flare max-w-full" title={prize}>
      <Trophy aria-hidden="true" />
      <span className="truncate">{prize}</span>
    </span>
  );
}

export function PlacePill({ e }: { e: Pick<EventRow, "city" | "country" | "format"> }) {
  const where = [e.city, e.country].filter(Boolean).join(", ");
  const online = e.format === "online";
  const Icon = online ? Globe : MapPin;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-dim">
      <Icon className="h-4 w-4 flex-none text-faint" aria-hidden="true" />
      <span className="truncate">{online ? "Online" : where || (e.format === "hybrid" ? "Hybrid" : "Location TBA")}</span>
    </span>
  );
}

export function Notice({ tone, children }: { tone: "ok" | "bad"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? CircleCheck : CircleAlert;
  return (
    <div role={tone === "ok" ? "status" : "alert"} className={`notice notice-${tone}`}>
      <Icon aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-line pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
        {children && <div className="mt-3 text-dim">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="card grid place-items-center gap-3 px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-raised text-accent">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="text-xl font-semibold">{title}</h2>
      {children && <div className="max-w-md text-dim">{children}</div>}
    </div>
  );
}
