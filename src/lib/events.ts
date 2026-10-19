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

export function sourceName(e: { event_sources?: { name: string } | null; url?: string; organizer?: string | null }): string {
  if (e.event_sources?.name && !e.event_sources.name.toLowerCase().includes("unknown")) {
    return e.event_sources.name.replace(/ opportunities| challenges| hackathons/i, "");
  }
  const u = (e.url ?? "").toLowerCase();
  const org = (e.organizer ?? "").toLowerCase();

  if (u.includes("unstop.com")) return "Unstop";
  if (u.includes("devpost.com")) return "Devpost";
  if (u.includes("devfolio.co")) return "Devfolio";
  if (u.includes("hackerearth.com")) return "HackerEarth";
  if (u.includes("mlh.io")) return "Major League Hacking";
  if (u.includes("iiit.ac.in") || org.includes("iiit hyderabad")) return "IIIT Hyderabad";
  if (u.includes("iith.ac.in") || org.includes("iit hyderabad") || org.includes("tihan")) return "IIT Hyderabad";
  if (u.includes("cbit.ac.in") || org.includes("cbit")) return "CBIT Hyderabad";
  if (u.includes("vnrvjiet.ac.in") || org.includes("vnr")) return "VNR VJIET";
  if (u.includes("t-hub.co") || org.includes("t-hub")) return "T-Hub Hyderabad";
  if (u.includes("tworks") || org.includes("t-works")) return "T-Works Hyderabad";
  if (u.includes("bits-pilani.ac.in") || org.includes("bits pilani")) return "BITS Pilani Hyderabad";
  if (u.includes("jntuh.ac.in") || org.includes("jntu")) return "JNTU Hyderabad";
  if (u.includes("vce.ac.in") || org.includes("vasavi")) return "Vasavi College";
  if (u.includes("osmania.ac.in") || org.includes("osmania")) return "Osmania University";
  if (org.includes("mjcet") || org.includes("muffakham")) return "MJCET Banjara Hills";
  if (org.includes("icfai") || org.includes("ibs")) return "ICFAI Hyderabad";
  
  if (e.organizer) return e.organizer.split(",")[0].trim();

  try {
    const host = new URL(e.url ?? "").hostname.replace(/^www\./, "");
    if (host) return host;
  } catch {}
  return "Verified Event Source";
}

