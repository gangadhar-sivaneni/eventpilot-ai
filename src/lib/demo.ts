/* Local persistence layer: runs with persistent JSON storage under data/store.json
   so every screen, filter, profile change, alert, and registration workflow is 100% workable
   and preserved across reloads. Switches to Supabase automatically when real keys are set. */

import fs from "node:fs";
import path from "node:path";
import { DEMO } from "@/lib/demo-flag";

export { DEMO };

export const DEMO_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "jaswanthi@eventpilot.ai",
  user_metadata: { full_name: "Jaswanthi Vykuntam", has_password: true },
  app_metadata: { role: "admin" },
};


type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

const day = 864e5;
const at = (days: number, hour = 12) => {
  const d = new Date(Date.now() + days * day);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

function seed(): Store {
  const sources = [
    ["devpost", "Devpost", "api", "https://devpost.com"],
    ["unstop", "Unstop", "api", "https://unstop.com"],
    ["devfolio", "Devfolio", "api", "https://devfolio.co"],
    ["hackerearth", "HackerEarth", "api", "https://hackerearth.com"],
    ["mlh", "Major League Hacking", "html", "https://mlh.io"],
    ["college_rss", "College Feeds", "rss", "https://feeds.college.edu"],
  ].map(([key, name, type, url], i) => ({
    id: i + 1,
    key,
    name,
    type,
    url,
    enabled: true,
    last_checked_at: at(0, 9),
    last_success_at: at(0, 9),
    last_error: null,
    last_counts: { fetched: 48 + i * 12, imported: 5 + i, updated: 34 + i * 6, invalid: 0, seconds: 3.2 + i * 0.4 },
  }));

  // [title, source_id, organizer, city, country, format, prize, fee, feeAmount, status, opensIn, closesIn, startsIn, categories, url, reg_url, description]
  const E: [
    string, number, string, string | null, string | null, string, string | null, string, number | null, string,
    number | null, number | null, number | null, string[], string, string | null, string
  ][] = [
    [
      "CodeStorm 48-Hour National Hackathon", 2, "Northbridge Institute of Technology", "Hyderabad", "India", "in_person",
      "₹1,50,000", "free", null, "open", -6, 9, 14, ["hackathon", "college", "ai"],
      "https://unstop.com/hackathons/codestorm-2026", "https://docs.google.com/forms/d/e/1FAIpQLScodestorm2026/viewform",
      "CodeStorm 2026 is an intense 48-hour offline hackathon inviting developers, designers, and innovators to build scalable solutions across AI, Web3, and Open Innovation. Features dedicated mentors, cloud credits, and cash prizes."
    ],
    [
      "Global AI Build Challenge", 1, "Open Models Collective", null, null, "online",
      "$50,000", "unknown", null, "open", -20, 12, -20, ["hackathon", "machine learning/ai"],
      "https://devpost.com/software/global-ai-build-challenge-2026", "https://devpost.com/hackathons/global-ai-build/register",
      "A worldwide virtual hackathon challenging builders to harness state-of-the-art open source models. Submit working prototypes in multimodal reasoning, agents, or edge AI to compete for the global prize pool."
    ],
    [
      "Deccan Design Sprint", 2, "Deccan School of Design", "Hyderabad", "India", "in_person",
      null, "paid", 299, "open", -3, 4, 6, ["workshop", "college", "design"],
      "https://unstop.com/workshops/deccan-design-sprint", "https://unstop.com/workshops/deccan-design-sprint/register",
      "A fast-paced interactive design sprint focused on user experience architecture, design systems, and rapid prototyping for mobile-first products."
    ],
    [
      "FinTech for Bharat Ideathon", 2, "Kaveri Business School", "Bengaluru", "India", "hybrid",
      "₹75,000", "free", null, "open", -10, 2, 5, ["competition", "college", "fintech"],
      "https://unstop.com/competitions/fintech-for-bharat-ideathon", "https://unstop.com/competitions/fintech-for-bharat-ideathon/register",
      "Ideate, build, and pitch disruptive financial technologies empowering rural and semi-urban communities across Bharat, focusing on micro-lending, UPI innovations, and digital credit."
    ],
    [
      "Web3 Builders Weekend", 3, "ChainCraft Labs", null, null, "online",
      "$2,000 USDC", "unknown", null, "open", -4, 6, 7, ["hackathon", "blockchain"],
      "https://devfolio.co/hackathons/web3-builders-weekend", "https://devfolio.co/hackathons/web3-builders-weekend/apply",
      "A virtual 48-hour build sprint for smart contract engineers and frontend developers building cross-chain DeFi applications and decentralized identity systems."
    ],
    [
      "Smart Campus IoT Challenge", 6, "Northbridge Institute of Technology", "Hyderabad", "India", "in_person",
      null, "unknown", null, "unknown", null, null, null, ["college", "hackathon"],
      "https://unstop.com/competitions/smart-campus-iot-challenge", "https://unstop.com/competitions/smart-campus-iot-challenge/register",
      "Develop connected hardware and sensor networks to automate energy management, access control, and campus safety across institutional facilities."
    ],
    [
      "Monsoon CTF 2026", 4, "SecureStack", null, null, "online",
      "₹40,000", "free", null, "upcoming", 3, 10, 11, ["competition", "cyber security"],
      "https://hackerearth.com/challenges/competitive/monsoon-ctf-2026", "https://hackerearth.com/challenges/competitive/monsoon-ctf-2026/register",
      "Annual cybersecurity capture-the-flag tournament testing binary exploitation, reverse engineering, web security, and cryptography skills."
    ],
    [
      "Robotics League Qualifier", 2, "Vindhya Engineering College", "Pune", "India", "in_person",
      "₹60,000", "paid", 500, "open", -12, 8, 20, ["competition", "college", "robotics"],
      "https://unstop.com/competitions/robotics-league-qualifier-2026", "https://unstop.com/competitions/robotics-league-qualifier-2026/register",
      "Regional robotics qualifying round featuring autonomous maze navigators, robotic arm obstacle sorting, and vision-guided drones."
    ],
    [
      "HackGainesville Fall", 5, "Major League Hacking member event", "Gainesville, Florida", "US", "in_person",
      null, "unknown", null, "unknown", null, null, 25, ["hackathon", "student", "mlh"],
      "https://mlh.io/seasons/2026/events/hackgainesville", "https://hackgainesville.org/register",
      "An official Major League Hacking collegiate hackathon bringing together over 500 collegiate hackers for 36 hours of software development, workshops, and recruitment opportunities."
    ],
    [
      "Climate Data Hack", 1, "Green Signal Foundation", null, null, "online",
      "$12,000", "unknown", null, "open", -30, 18, -30, ["hackathon", "sustainability"],
      "https://devpost.com/hackathons/climate-data-hack-2026", "https://devpost.com/hackathons/climate-data-hack-2026/register",
      "Harness open satellite data, climate models, and geographical insights to build predictive tools and resilience maps for extreme weather events."
    ],
    [
      "Product Management Bootcamp", 2, "Kaveri Business School", "Bengaluru", "India", "online",
      null, "paid", 1499, "open", -2, 15, 16, ["workshop", "product"],
      "https://unstop.com/workshops/product-management-bootcamp", "https://unstop.com/workshops/product-management-bootcamp/apply",
      "Comprehensive 2-day workshop led by industry leaders covering PRDs, metrics analysis, customer discovery interviews, and product roadmap prioritization."
    ],
    [
      "Quantum Quiz Night", 6, "Deccan Tech Society", "Hyderabad", "India", "in_person",
      "₹10,000", "free", null, "upcoming", 2, 7, 8, ["college", "quiz"],
      "https://unstop.com/quiz/quantum-quiz-night-2026", "https://unstop.com/quiz/quantum-quiz-night-2026/register",
      "Fast-paced competitive quiz covering physics, computing history, quantum algorithms, and breakthrough scientific discoveries."
    ],
    [
      "HealthTech Innovation Challenge", 3, "MediBridge Foundation", "Chennai", "India", "hybrid",
      "₹2,00,000", "free", null, "open", -15, 20, 30, ["hackathon", "healthcare"],
      "https://devfolio.co/hackathons/healthtech-innovation-challenge", "https://devfolio.co/hackathons/healthtech-innovation-challenge/apply",
      "Collaborative healthcare technology competition building telemedicine tools, diagnostic computer vision models, and hospital resource optimizers."
    ],
    [
      "Open Source Contribution Month", 4, "GitGrove", null, null, "online",
      null, "free", null, "open", -5, 25, -5, ["competition", "open source"],
      "https://hackerearth.com/challenges/competitive/open-source-month-2026", "https://hackerearth.com/challenges/competitive/open-source-month-2026/register",
      "Month-long structured open-source sprint rewarding verified pull requests, bug fixes, and documentation improvements across high-impact developer tools."
    ],
    [
      "Hyderabad Startup Pitch Day", 2, "T-Square Incubator", "Hyderabad", "India", "in_person",
      "₹5,00,000", "free", null, "upcoming", 5, 21, 28, ["competition", "startup"],
      "https://unstop.com/competitions/hyderabad-startup-pitch-day", "https://unstop.com/competitions/hyderabad-startup-pitch-day/apply",
      "Live startup pitch showcase connecting early-stage student and graduate founders with angel syndicates, venture capitalists, and grant providers."
    ],
    [
      "Game Jam: Retro Remix", 1, "Pixel Forge", null, null, "online",
      "$5,000", "unknown", null, "open", -7, 3, -2, ["hackathon", "gaming"],
      "https://devpost.com/hackathons/retro-remix-gamejam-2026", "https://devpost.com/hackathons/retro-remix-gamejam-2026/register",
      "72-hour indie game development sprint with constraints: build arcade-inspired experiences featuring modern mechanics and retro aesthetic."
    ],
    [
      "Data Structures Coding Contest", 4, "AlgoArena", null, null, "online",
      "₹25,000", "free", null, "upcoming", 1, 1.5, 2, ["competition", "coding"],
      "https://hackerearth.com/challenges/competitive/algoarena-ds-contest", "https://hackerearth.com/challenges/competitive/algoarena-ds-contest/register",
      "High-speed algorithmic contest testing dynamic programming, graph theory, trees, and string algorithms with real-time leaderboard rankings."
    ],
    [
      "Cloud Native Workshop", 6, "Northbridge Institute of Technology", "Hyderabad", "India", "in_person",
      null, "unknown", null, "unknown", null, null, null, ["college", "workshop"],
      "https://unstop.com/workshops/cloud-native-kubernetes-workshop", "https://unstop.com/workshops/cloud-native-kubernetes-workshop/register",
      "Hands-on architectural masterclass on microservices deployment, container orchestration with Kubernetes, CI/CD automation, and observability pipelines."
    ],
  ];

  const events = E.map(([title, source_id, organizer, city, country, format, prize_text, fee_status, fee_amount, registration_status, o, c, s, categories, url, reg_url, description], i) => ({
    id: i + 1,
    source_id,
    external_id: `evt-${i + 1}`,
    title,
    organizer,
    city,
    country,
    format,
    prize_text,
    fee_status,
    fee_amount: fee_status === "free" ? 0 : fee_amount,
    fee_currency: fee_amount ? "INR" : null,
    registration_status,
    categories,
    url,
    registration_url: reg_url,
    description,
    eligibility: categories.includes("college") ? "Currently enrolled undergraduate or postgraduate students." : null,
    registration_opens_at: o == null ? null : at(o, 4),
    registration_deadline: c == null ? null : at(c, 18),
    starts_at: s == null ? null : at(s, 4),
    ends_at: s == null ? null : at(s + 2, 16),
    first_seen_at: at(-i * 0.4, 8),
    last_checked_at: at(0, 9),
  }));

  const uid = DEMO_USER.id;
  const ans = (label: string, kind: string, value: string, source: string, required = true, options: string[] = []) =>
    ({ label, kind, form_kind: kind === "consent" ? "checkbox" : kind, value, source, confidence: value ? 1 : 0, required, options, handle: label });

  return {
    event_sources: sources,
    events,
    profiles: [{
      user_id: uid,
      email: DEMO_USER.email,
      full_name: "Jaswanthi Vykuntam",
      phone: "+91 98765 43210",
      date_of_birth: "2003-08-14",
      gender: "female",
      country: "India",
      city: "Hyderabad",
      organization: "Northbridge Institute of Technology",
      occupation: "Computer Science Undergraduate",
      student_id: "22NB1A0501",
      department: "Computer Science and Engineering",
      graduation_year: 2026,
      bio: "Passionate full-stack developer and AI enthusiast building autonomous agents and developer tooling.",
      portfolio_url: "https://jaswanthi.dev",
      github_url: "https://github.com/jaswanthi",
      linkedin_url: "https://linkedin.com/in/jaswanthi",
      resume_url: "https://jaswanthi.dev/resume.pdf",
      tshirt_size: "M",
    }],
    user_preferences: [{
      user_id: uid,
      categories: ["hackathon", "ai"],
      countries: ["India"],
      cities: ["Hyderabad"],
      formats: [],
      max_fee: null,
      prize_only: false,
      alert_new_event: true,
      alert_registration_opened: true,
      alert_deadline_reminder: true,
      alert_availability_changed: true,
      email_alerts: true,
    }],
    registration_answers: [
      { id: 1, user_id: uid, question: "Why do you want to attend?", answer: "To build impactful solutions with an agile team, explore cutting-edge AI architectures, and learn from industry mentors." },
      { id: 2, user_id: uid, question: "Have you participated in a hackathon before?", answer: "Yes, participated in two national hackathons in 2025 and built automated workflow agents." },
    ],
    saved_searches: [
      { id: 1, user_id: uid, name: "Prize hackathons in Hyderabad", filters: { prize: "1", city: "Hyderabad" }, created_at: at(-3) },
      { id: 2, user_id: uid, name: "Free online events", filters: { fee: "free", format: "online" }, created_at: at(-8) },
    ],
    event_alerts: [
      [1, "new_event", "New match: CodeStorm 48-Hour National Hackathon (prize ₹1,50,000)", null, -0.1],
      [4, "deadline_reminder", "Registration for FinTech for Bharat Ideathon closes within 24 hours", null, -0.3],
      [7, "new_event", "New match: Monsoon CTF 2026 (prize ₹40,000)", null, -0.6],
      [15, "registration_opened", "Registration is now open for Hyderabad Startup Pitch Day", at(-1), -1.2],
      [2, "availability_changed", "Global AI Build Challenge: registration status changed to open", at(-2), -2.5],
    ].map(([event_id, alert_type, message, read_at, d], i) => ({
      id: i + 1,
      user_id: uid,
      event_id,
      alert_type,
      message,
      read_at,
      emailed_at: null,
      created_at: at(d as number, 10),
    })),
    registrations: [
      {
        id: 1,
        user_id: uid,
        event_id: 1,
        status: "awaiting_approval",
        attempt_count: 1,
        approved_at: null,
        approved_fee_amount: null,
        evidence: null,
        error_summary: null,
        updated_at: at(-0.05),
        proposed_answers: [
          ans("Full name", "text", "Jaswanthi Vykuntam", "profile.full_name"),
          ans("College email", "email", "jaswanthi@eventpilot.ai", "profile.email"),
          ans("College name", "text", "Northbridge Institute of Technology", "profile.organization"),
          ans("T-shirt size", "select", "M", "profile.tshirt_size", false, ["S", "M", "L", "XL"]),
          ans("Why do you want to attend?", "textarea", "To build impactful solutions with an agile team, explore cutting-edge AI architectures, and learn from industry mentors.", "saved answer"),
          ans("Team name", "text", "NeuralPilots", "user_edit"),
          ans("I agree to the code of conduct", "consent", "yes", "consent"),
        ],
        unresolved_fields: [],
      },
      {
        id: 2,
        user_id: uid,
        event_id: 3,
        status: "not_started",
        attempt_count: 0,
        approved_at: null,
        approved_fee_amount: null,
        evidence: null,
        error_summary: null,
        updated_at: at(-0.5),
        proposed_answers: [],
        unresolved_fields: [],
      },
      {
        id: 3,
        user_id: uid,
        event_id: 13,
        status: "confirmed",
        attempt_count: 1,
        approved_at: at(-2),
        approved_fee_amount: null,
        evidence: "Registration confirmed. Application reference #HTI-58213 logged.",
        error_summary: null,
        updated_at: at(-2),
        proposed_answers: [
          ans("Full name", "text", "Jaswanthi Vykuntam", "profile.full_name"),
          ans("Email", "email", "jaswanthi@eventpilot.ai", "profile.email")
        ],
        unresolved_fields: [],
      },
      {
        id: 4,
        user_id: uid,
        event_id: 10,
        status: "unknown",
        attempt_count: 1,
        approved_at: at(-4),
        approved_fee_amount: null,
        evidence: null,
        error_summary: "No confirmation signal returned after submit. Check your email; not resubmitting.",
        updated_at: at(-4),
        proposed_answers: [ans("Full name", "text", "Jaswanthi Vykuntam", "profile.full_name")],
        unresolved_fields: [],
      },
    ],
    automation_jobs: [
      ...sources.map((s, i) => ({
        id: i + 1,
        kind: "discovery",
        scope: s.key,
        status: "succeeded",
        counts: s.last_counts,
        error: null,
        started_at: at(0, 9)
      })),
      { id: 7, kind: "match", scope: "", status: "succeeded", counts: { new_events: 18, users: 1, alerts_proposed: 5 }, error: null, started_at: at(0, 9) },
      { id: 8, kind: "notify", scope: "", status: "succeeded", counts: { sent: 3, failed: 0 }, error: null, started_at: at(0, 9) },
    ],
    audit_logs: [],
  };
}
function loadStore(): Store {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const content = fs.readFileSync(STORE_PATH, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Failed to read store.json, re-seeding", err);
  }
  const initial = seed();
  saveStore(initial);
  return initial;
}

function saveStore(s: Store): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(s, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save store.json", err);
  }
}

const g = globalThis as unknown as { __demoStore?: Store; __lastMtime?: number };
export const store = () => {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const mtime = fs.statSync(STORE_PATH).mtimeMs;
      if (!g.__demoStore || mtime > (g.__lastMtime ?? 0)) {
        g.__lastMtime = mtime;
        g.__demoStore = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
      }
    } else if (g.__demoStore) {
      saveStore(g.__demoStore);
    }
  } catch (err) {
    console.error("Failed to sync store with disk", err);
  }
  return (g.__demoStore ??= loadStore());
};

// ───────────── a tiny, synchronous stand-in for the PostgREST query builder ─────────────
const JOINS: Record<string, [string, string]> = {
  event_sources: ["event_sources", "source_id"],
  events: ["events", "event_id"],
};

function like(pattern: string) {
  return new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "i");
}

function cmp(a: unknown, b: unknown) {
  return typeof a === "number" || typeof b === "number" ? Number(a) - Number(b) : String(a).localeCompare(String(b));
}

function test(row: Row, col: string, op: string, raw: unknown): boolean {
  const v = row[col];
  const val = typeof raw === "string" ? raw.replace(/^"|"$/g, "") : raw;
  switch (op) {
    case "eq": return String(v) === String(val);
    case "neq": return String(v) !== String(val);
    case "is": return val === null || val === "null" ? v == null : v === val;
    case "gt": return v != null && cmp(v, val) > 0;
    case "gte": return v != null && cmp(v, val) >= 0;
    case "lt": return v != null && cmp(v, val) < 0;
    case "lte": return v != null && cmp(v, val) <= 0;
    default: return true;
  }
}

class DemoQuery {
  private table: string;
  private filters: ((r: Row) => boolean)[] = [];
  private sort?: [string, boolean];
  private window?: [number, number];
  private mode: "select" | "update" | "insert" | "upsert" | "delete" = "select";
  private payload?: Row | Row[];
  private joins: string[] = [];
  private countOpt = false;
  private head = false;
  private one: "single" | "maybe" | null = null;
  private conflict?: string[];

  constructor(table: string) {
    this.table = table;
  }

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    this.joins = Object.keys(JOINS).filter((j) => cols.includes(`${j}(`));
    this.countOpt = !!opts?.count;
    this.head = !!opts?.head;
    return this;
  }
  eq(c: string, v: unknown) { this.filters.push((r) => test(r, c, "eq", v)); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => test(r, c, "neq", v)); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => test(r, c, "is", v)); return this; }
  gt(c: string, v: unknown) { this.filters.push((r) => test(r, c, "gt", v)); return this; }
  gte(c: string, v: unknown) { this.filters.push((r) => test(r, c, "gte", v)); return this; }
  lt(c: string, v: unknown) { this.filters.push((r) => test(r, c, "lt", v)); return this; }
  lte(c: string, v: unknown) { this.filters.push((r) => test(r, c, "lte", v)); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.map(String).includes(String(r[c]))); return this; }
  ilike(c: string, p: string) { const re = like(p); this.filters.push((r) => re.test(String(r[c] ?? ""))); return this; }
  contains(c: string, vs: unknown[]) { this.filters.push((r) => vs.every((v) => (r[c] as unknown[] | null)?.includes(v))); return this; }
  not(c: string, op: string, v: unknown) { this.filters.push((r) => !test(r, c, op, v)); return this; }
  or(expr: string) {
    const parts = expr.match(/(?:[^,"]|"[^"]*")+/g) ?? [];
    const tests = parts.map((p) => { const [c, op, ...rest] = p.split("."); return (r: Row) => test(r, c, op, rest.join(".")); });
    this.filters.push((r) => tests.some((t) => t(r)));
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) { this.sort = [c, o?.ascending ?? true]; return this; }
  range(a: number, b: number) { this.window = [a, b]; return this; }
  limit(n: number) { this.window = [0, n - 1]; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  update(p: Row) { this.mode = "update"; this.payload = p; return this; }
  insert(p: Row | Row[]) { this.mode = "insert"; this.payload = p; return this; }
  upsert(p: Row | Row[], o?: { onConflict?: string }) { this.mode = "upsert"; this.payload = p; this.conflict = o?.onConflict?.split(","); return this; }
  delete() { this.mode = "delete"; return this; }

  run() {
    const s = store();
    const rows = (s[this.table] ??= []);
    const match = (r: Row) => this.filters.every((f) => f(r));

    if (this.mode === "update") {
      rows.filter(match).forEach((r) => Object.assign(r, this.payload, "updated_at" in r ? { updated_at: new Date().toISOString() } : {}));
      saveStore(s);
      return { data: null, error: null };
    }
    if (this.mode === "delete") {
      s[this.table] = rows.filter((r) => !match(r));
      saveStore(s);
      return { data: null, error: null };
    }
    if (this.mode === "insert" || this.mode === "upsert") {
      for (const p of ([] as Row[]).concat(this.payload ?? [])) {
        const row: Row = { user_id: DEMO_USER.id, ...p };
        const key = this.conflict ?? (this.table === "registrations" ? ["user_id", "event_id"] : null);
        const dup = key && rows.find((r) => key.every((k) => String(r[k]) === String(row[k])));
        if (dup && this.mode === "insert") return { data: null, error: { message: "duplicate key", code: "23505" } };
        if (dup) { Object.assign(dup, row); continue; }
        rows.push({
          id: Math.max(0, ...rows.map((r) => Number(r.id) || 0)) + 1,
          created_at: new Date().toISOString(),
          ...(this.table === "registrations"
            ? {
                status: "not_started",
                attempt_count: 0,
                proposed_answers: [],
                unresolved_fields: [],
                approved_at: null,
                evidence: null,
                error_summary: null,
                updated_at: new Date().toISOString(),
              }
            : {}),
          ...row,
        });
      }
      saveStore(s);
      return { data: null, error: null };
    }

    let out = rows.filter(match);
    const count = out.length;
    if (this.sort) {
      const [c, asc] = this.sort;
      out = [...out].sort((a, b) => (a[c] == null ? 1 : b[c] == null ? -1 : cmp(a[c], b[c]) * (asc ? 1 : -1)));
    }
    if (this.window) out = out.slice(this.window[0], this.window[1] + 1);
    out = out.map((r) => {
      const copy = structuredClone(r);
      for (const j of this.joins) {
        const [t, fk] = JOINS[j];
        copy[j] = store()[t]?.find((x) => x.id === r[fk]) ?? null;
      }
      return copy;
    });
    if (this.head) return { data: null, error: null, count };
    if (this.one) {
      if (!out.length && this.one === "single") return { data: null, error: { message: "not found" } };
      return { data: out[0] ?? null, error: null };
    }
    return { data: out, error: null, count: this.countOpt ? count : null };
  }

  then<A, B>(ok?: ((v: ReturnType<DemoQuery["run"]>) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(ok, fail);
  }
}

export function demoClient(signedIn: boolean) {
  return {
    from: (t: string) => new DemoQuery(t),
    rpc: async (fn: string) => {
      if (fn === "delete_my_account") {
        g.__demoStore = seed();
        saveStore(g.__demoStore);
      }
      return { data: null, error: null };
    },
    auth: {
      getUser: async () => {
        if (!signedIn) return { data: { user: null }, error: null };
        const p = store().profiles?.find((x) => x.user_id === DEMO_USER.id);
        const name = (p?.full_name as string) || DEMO_USER.user_metadata.full_name;
        const email = (p?.email as string) || DEMO_USER.email;
        return {
          data: {
            user: {
              ...DEMO_USER,
              email,
              user_metadata: { ...DEMO_USER.user_metadata, full_name: name },
            },
          },
          error: null,
        };
      },
      getClaims: async () => ({
        data: signedIn ? { claims: { sub: DEMO_USER.id, user_metadata: DEMO_USER.user_metadata } } : null,
        error: null,
      }),
      signOut: async () => ({ error: null }),
      exchangeCodeForSession: async () => ({ data: {}, error: null }),
      signInWithPassword: async () => ({ data: { user: DEMO_USER, session: {} }, error: null }),
      signInWithOtp: async () => ({ data: { user: null, session: null }, error: null }),
      verifyOtp: async () => ({ data: { user: DEMO_USER, session: {} }, error: null }),
      updateUser: async () => ({ data: { user: DEMO_USER }, error: null }),
      signInWithOAuth: async () => ({ data: { url: "/auth/callback?demo_google=1" }, error: null }),
    },
  };
}


