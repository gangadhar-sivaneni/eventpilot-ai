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
  const u = (e.url ?? "").toLowerCase();
  const org = (e.organizer ?? "").toLowerCase();

  // 1. High-priority exact brand and campus attribution
  if (u.includes("intellicon") || org.includes("intellicon") || org.includes("global ai community")) return "Global AI Community (Microsoft)";
  if (u.includes("microsoft") || org.includes("microsoft")) return "Microsoft";
  if (u.includes("servicenow") || org.includes("servicenow")) return "ServiceNow";
  if (u.includes("salesforce") || org.includes("salesforce")) return "Salesforce";
  if (u.includes("thoughtworks") || org.includes("thoughtworks")) return "Thoughtworks";
  if (u.includes("oracle") || org.includes("oracle")) return "Oracle";
  if (u.includes("qualcomm") || org.includes("qualcomm")) return "Qualcomm";
  if (u.includes("uber") || org.includes("uber")) return "Uber";
  if (u.includes("t-hub") || org.includes("t-hub")) return "T-Hub Hyderabad";
  if (u.includes("tworks") || org.includes("t-works")) return "T-Works Hyderabad";

  // Hyderabad Colleges
  if (u.includes("cbit") || org.includes("cbit") || org.includes("chaitanya bharathi")) return "CBIT Hyderabad";
  if (u.includes("vnrvjiet") || org.includes("vnr") || org.includes("vjiet") || org.includes("vignana jyothi")) return "VNR VJIET";
  if (u.includes("vce.ac.in") || org.includes("vasavi")) return "Vasavi College";
  if (u.includes("iiit.ac.in") || org.includes("iiit hyderabad")) return "IIIT Hyderabad";
  if (u.includes("iith.ac.in") || org.includes("iit hyderabad") || org.includes("tihan")) return "IIT Hyderabad";
  if (u.includes("bits-pilani") || u.includes("bits-atmos") || org.includes("bits pilani")) return "BITS Pilani Hyderabad";
  if (u.includes("osmania.ac.in") || org.includes("osmania") || u.includes("uceou")) return "Osmania University";
  if (u.includes("jntuh.ac.in") || org.includes("jntu") || org.includes("jawaharlal nehru technological")) return "JNTU Hyderabad";
  if (u.includes("mjcollege") || org.includes("mjcet") || org.includes("muffakham")) return "MJCET Banjara Hills";
  if (u.includes("mlrit") || org.includes("mlrit") || org.includes("marri laxman") || u.includes("equinox")) return "MLRIT Hyderabad";
  if (u.includes("kmit.in") || org.includes("kmit") || org.includes("keshav memorial")) return "KMIT Hyderabad";
  if (u.includes("griet.ac.in") || org.includes("griet") || org.includes("gokaraju")) return "GRIET Hyderabad";
  if (u.includes("bvrit.ac.in") || org.includes("bvrit")) return "BVRIT Hyderabad";
  if (u.includes("sreenidhi.edu.in") || org.includes("snist") || org.includes("sreenidhi") || u.includes("roboveda")) return "SNIST Hyderabad";
  if (u.includes("cvr.ac.in") || org.includes("cvr")) return "CVR College";
  if (u.includes("vardhaman.org") || org.includes("vardhaman")) return "Vardhaman College";
  if (u.includes("ibsindia") || org.includes("icfai") || org.includes("ibs hyderabad")) return "ICFAI / IBS Hyderabad";

  // Tech communities
  if (u.includes("hydpy") || org.includes("hydpy")) return "HydPy (Python Hyderabad)";
  if (u.includes("cloudnative") || org.includes("cncf") || org.includes("kubeday")) return "CNCF Hyderabad";
  if (u.includes("gccx") || org.includes("hysea")) return "HYSEA & GCC X Hyderabad";
  if (u.includes("aws") && (u.includes("hyderabad") || org.includes("hyderabad"))) return "AWS User Group Hyderabad";
  if (u.includes("gdg") && (u.includes("hyderabad") || org.includes("hyderabad"))) return "GDG Hyderabad";
  if (u.includes("fossunited") || org.includes("foss united")) return "FOSS United Hyderabad";

  // Other tech giants
  if (u.includes("google.com") || org.includes("google") || org.includes("gdsc")) return "Google";
  if (u.includes("amazon") || org.includes("amazon")) return "Amazon";
  if (u.includes("flipkart") || org.includes("flipkart")) return "Flipkart";
  if (u.includes("nvidia") || org.includes("nvidia")) return "NVIDIA";
  if (org.includes("tata") || u.includes("tata")) return "Tata Group";
  if (u.includes("ibm.com") || org.includes("ibm") || u.includes("callforcode")) return "IBM";

  // 2. Specific event source name if provided and not generic
  if (e.event_sources?.name && !e.event_sources.name.toLowerCase().includes("unknown") && !e.event_sources.name.toLowerCase().includes("tech community")) {
    return e.event_sources.name.replace(/ opportunities| challenges| hackathons/i, "");
  }

  // 3. Fall back to platforms
  if (u.includes("unstop.com")) return "Unstop";
  if (u.includes("devpost.com")) return "Devpost";
  if (u.includes("devfolio.co")) return "Devfolio";
  if (u.includes("lu.ma") || u.includes("luma.com")) return "Luma";
  if (u.includes("studenttribe.in")) return "StudentTribe";
  if (u.includes("hackerearth.com")) return "HackerEarth";
  if (u.includes("mlh.io")) return "Major League Hacking";

  if (e.organizer) return e.organizer.split(",")[0].trim();


  try {
    const host = new URL(e.url ?? "").hostname.replace(/^www\./, "");
    if (host) return host;
  } catch {}
  return "Verified Event Source";
}

const UNSTOP_OPP_PATTERN = /^https?:\/\/(?:www\.)?unstop\.com\/(?:(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+-\d{5,9}|(?:o|p)\/\d+)(?:\/.*)?$/i;

/**
 * Validates that an Unstop URL points to a genuine opportunity with a numeric ID.
 * Slugs without numeric IDs 404 in Unstop's SPA and redirect to fallback/default events.
 */
export function isValidOpportunityUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "unstop.com" || host.endsWith(".unstop.com")) {
      const path = parsed.pathname.toLowerCase();
      if (
        path.startsWith("/competitions") ||
        path.startsWith("/hackathons") ||
        path.startsWith("/workshops-webinars") ||
        path.startsWith("/conferences") ||
        path.startsWith("/quizzes") ||
        path.startsWith("/cultural-events") ||
        path.startsWith("/college-fests") ||
        path.startsWith("/o/") ||
        path.startsWith("/p/")
      ) {
        return UNSTOP_OPP_PATTERN.test(url);
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns a safe registration URL, or null if the URL is suspect or would redirect to an unintended event.
 */
export function safeRegistrationUrl(e: Pick<EventRow, "url" | "registration_url">): string | null {
  if (e.registration_url && isValidOpportunityUrl(e.registration_url)) {
    return e.registration_url;
  }
  return null;
}

/**
 * Returns a guaranteed safe official event page URL.
 * Never redirects users to a broken/foreign competition slug.
 */
export function safeOfficialUrl(e: Pick<EventRow, "url" | "registration_url">): string {
  if (e.url && isValidOpportunityUrl(e.url)) {
    return e.url;
  }
  if (e.registration_url && isValidOpportunityUrl(e.registration_url)) {
    return e.registration_url;
  }
  return e.url;
}

