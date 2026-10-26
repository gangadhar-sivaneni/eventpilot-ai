import { CircleAlert, CircleCheck, Globe, MapPin, Trophy, Wallet, type LucideIcon } from "lucide-react";
import type { EventRow } from "@/lib/events";

const STATUS: Record<EventRow["registration_status"], [string, string]> = {
  open: ["Registration open", "pill-ok"],
  upcoming: ["Opens soon", "pill-warn"],
  closed: ["Closed", "pill-bad"],
  unknown: ["Status unknown", ""],
};

export function StatusPill({ status, compact }: { status: EventRow["registration_status"]; compact?: boolean }) {
  const [label, tone] = STATUS[status];
  return (
    <span className={`pill ${tone} ${compact ? "!h-5 !px-1.5 !text-[0.68rem] sm:!h-6 sm:!px-2 sm:!text-xs gap-1" : ""}`.trim()}>
      {status === "open" && <span className="ping relative h-1.5 w-1.5 rounded-full bg-ok flex-none" aria-hidden="true" />}
      <span className="truncate">{label}</span>
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

export function formatPrizeShort(prize: string): string {
  const p = prize.trim();
  // 1. Try to extract currency symbol + amount like ₹30,000, $50,000, €10,000, £2,500
  const m1 = p.match(/(?:₹|\$|€|£|Rs\.?\s*)\s*[\d,]+(?:\s*(?:k|lakhs?|cr|m|b))?/i);
  if (m1) return m1[0].replace(/\s+/g, "").trim();
  // 2. Try to extract number + currency code like 30,000 INR, 50,000 USD
  const m2 = p.match(/[\d,]+\s*(?:INR|USD|EUR|GBP|Lakhs?|Cr)/i);
  if (m2) return m2[0].trim();
  return p;
}

export function PrizePill({ prize, className = "", compact }: { prize: string | null; className?: string; compact?: boolean }) {
  if (!prize) return null;
  const short = formatPrizeShort(prize);
  return (
    <span
      className={`pill pill-flare shrink-0 justify-center overflow-hidden ${
        compact
          ? "!h-5 !px-1.5 !text-[0.68rem] sm:!h-6 sm:!px-2 sm:!text-xs max-w-[5.75rem] sm:max-w-[7.5rem] gap-1"
          : "max-w-[5.75rem] sm:max-w-[7.5rem]"
      } ${className}`.trim()}
      title={prize}
    >
      <Trophy className={`${compact ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-3.5 w-3.5"} shrink-0`} aria-hidden="true" />
      <span className="truncate min-w-0">{short}</span>
    </span>
  );
}

export function PlacePill({ e, compact }: { e: Pick<EventRow, "city" | "country" | "format">; compact?: boolean }) {
  const where = [e.city, e.country].filter(Boolean).join(", ");
  const online = e.format === "online";
  const Icon = online ? Globe : MapPin;
  return (
    <span className={`inline-flex min-w-0 items-center ${compact ? "gap-1 text-[0.72rem] sm:text-xs md:text-sm text-dim" : "gap-1.5 text-sm text-dim"}`}>
      <Icon className={`${compact ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-4 w-4"} flex-none text-faint`} aria-hidden="true" />
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
