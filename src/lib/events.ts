export type EventRow = {
  id: number;
  url: string;
  registration_url: string | null;
  title: string;
  description: string | null;
  organizer: string | null;
  city: string | null;
  country: string | null;
  format: "online" | "in_person" | "hybrid" | "unknown";
  starts_at: string | null;
  ends_at: string | null;
  registration_opens_at: string | null;
  registration_deadline: string | null;
  fee_status: "free" | "paid" | "unknown";
  fee_amount: number | null;
  fee_currency: string | null;
  prize_text: string | null;
  registration_status: "upcoming" | "open" | "closed" | "unknown";
  eligibility: string | null;
  categories: string[];
  last_checked_at: string;
  event_sources: { name: string } | null;
};

export const EVENT_COLUMNS = "*, event_sources(name)";
export const FILTER_KEYS = ["q", "country", "city", "format", "category", "fee", "status", "prize", "from", "to"] as const;

// Unknown is never shown (or filtered) as free.
export function feeLabel(e: Pick<EventRow, "fee_status" | "fee_amount" | "fee_currency">) {
  if (e.fee_status === "free") return "Free";
  if (e.fee_status === "paid")
    return e.fee_amount != null ? `Paid · ${e.fee_amount} ${e.fee_currency ?? ""}`.trim() : "Paid · amount unknown";
  return "Fee unknown";
}

export const FORMAT_LABEL: Record<EventRow["format"], string> = {
  online: "Online",
  in_person: "In person",
  hybrid: "Hybrid",
  unknown: "Format unknown",
};

export const STATUS_LABEL: Record<EventRow["registration_status"], string> = {
  upcoming: "Registration not open yet",
  open: "Registration open",
  closed: "Registration closed",
  unknown: "Registration status unknown",
};

export function place(e: Pick<EventRow, "city" | "country" | "format">) {
  return [e.city, e.country].filter(Boolean).join(", ") || FORMAT_LABEL[e.format];
}
