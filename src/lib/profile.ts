// One list drives the profile form, its server-side validation, and the agent's field names.
export type Field = {
  key: string;
  label: string;
  type: "text" | "tel" | "date" | "url" | "number" | "select" | "textarea";
  max?: number;
  options?: [string, string][];
  autoComplete?: string;
};

export const PROFILE_GROUPS = ["About you", "Study & work", "Links", "Extras"] as const;

export const PROFILE_FIELDS: (Field & { group: (typeof PROFILE_GROUPS)[number] })[] = [
  { group: "About you", key: "full_name", label: "Full name", type: "text", max: 120, autoComplete: "name" },
  { group: "About you", key: "phone", label: "Phone (with country code)", type: "tel", max: 20, autoComplete: "tel" },
  { group: "About you", key: "date_of_birth", label: "Date of birth", type: "date", autoComplete: "bday" },
  {
    group: "About you", key: "gender", label: "Gender", type: "select",
    options: [["female", "Female"], ["male", "Male"], ["non_binary", "Non-binary"], ["prefer_not_to_say", "Prefer not to say"]],
  },
  { group: "About you", key: "country", label: "Country", type: "text", max: 60, autoComplete: "country-name" },
  { group: "About you", key: "city", label: "City", type: "text", max: 80, autoComplete: "address-level2" },
  { group: "Study & work", key: "organization", label: "College / organization", type: "text", max: 160, autoComplete: "organization" },
  { group: "Study & work", key: "occupation", label: "Occupation", type: "text", max: 80, autoComplete: "organization-title" },
  { group: "Study & work", key: "student_id", label: "Roll number / student ID", type: "text", max: 40 },
  { group: "Study & work", key: "department", label: "Branch / department", type: "text", max: 80 },
  { group: "Study & work", key: "graduation_year", label: "Graduation year", type: "number" },
  { group: "Links", key: "portfolio_url", label: "Portfolio URL", type: "url", max: 300, autoComplete: "url" },
  { group: "Links", key: "github_url", label: "GitHub URL", type: "url", max: 300 },
  { group: "Links", key: "linkedin_url", label: "LinkedIn URL", type: "url", max: 300 },
  { group: "Links", key: "resume_url", label: "Resume link (Drive, etc.)", type: "url", max: 300 },
  {
    group: "Extras", key: "tshirt_size", label: "T-shirt size", type: "select",
    options: ["XS", "S", "M", "L", "XL", "XXL"].map((s) => [s, s] as [string, string]),
  },
  { group: "Extras", key: "bio", label: "Short bio", type: "textarea", max: 1000 },
];

// Returns [cleanValues, errorMessage]. Empty inputs become null (cleared), never "".
export function validateProfile(form: FormData): [Record<string, string | number | null>, string | null] {
  const out: Record<string, string | number | null> = {};
  for (const f of PROFILE_FIELDS) {
    const raw = String(form.get(f.key) ?? "").trim();
    if (!raw) { out[f.key] = null; continue; }
    if (f.max && raw.length > f.max) return [out, `${f.label} is too long`];
    if (f.type === "url" && !/^https?:\/\/[^\s]+$/.test(raw)) return [out, `${f.label} must start with http:// or https://`];
    if (f.type === "tel" && !/^\+?[0-9 ()-]{7,20}$/.test(raw)) return [out, `${f.label} looks invalid`];
    if (f.type === "date" && (Number.isNaN(Date.parse(raw)) || new Date(raw) > new Date() || raw < "1900-01-02"))
      return [out, `${f.label} must be a past date`];
    if (f.type === "select" && !f.options!.some(([v]) => v === raw)) return [out, `${f.label} has an invalid choice`];
    if (f.type === "number") {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1950 || n > 2100) return [out, `${f.label} must be a year`];
      out[f.key] = n;
      continue;
    }
    out[f.key] = raw;
  }
  return [out, null];
}

export const list = (raw: FormDataEntryValue | null, lower = false) =>
  [...new Set(String(raw ?? "").split(",").map((s) => (lower ? s.trim().toLowerCase() : s.trim())).filter(Boolean))].slice(0, 30);
