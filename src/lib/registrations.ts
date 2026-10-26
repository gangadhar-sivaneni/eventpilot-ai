// Mirrors worker/registration.py (unresolved_labels / pick_option). The worker re-checks before
// submitting, so this copy only drives the UI; keep the two in step.
export type Proposed = {
  label: string;
  kind: string; // text | email | tel | url | number | date | textarea | radio | select | checkbox | consent | file | payment | unsupported
  form_kind: string;
  value: string;
  source: string;
  confidence: number;
  required: boolean;
  options?: string[];
};

export const MANUAL_KINDS = new Set(["file", "payment", "unsupported"]);
export const CHOICE_KINDS = new Set(["radio", "select", "checkbox"]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
export const pickOption = (v: string, options: string[] = []) => options.find((o) => norm(o) === norm(v));

export function unresolved(items: Proposed[]): string[] {
  const out: string[] = [];
  for (const i of items) {
    if (MANUAL_KINDS.has(i.kind)) {
      if (i.required) out.push(`${i.label} (complete this on the official page)`);
    } else if (i.kind === "consent") {
      if (i.required && i.value !== "yes") out.push(`${i.label} (tick to agree on the website)`);
    } else if (CHOICE_KINDS.has(i.kind) && i.value && !i.value.split(";").every((v) => pickOption(v, i.options)))
      out.push(`${i.label} (value must be one of: ${(i.options ?? []).join(", ")})`);
    else if (i.required && !i.value) out.push(i.label);
  }
  return out;
}

export function buildProposedAnswers(
  profile: Record<string, unknown> | null | undefined,
  answers: { question: string; answer: string }[] | null | undefined,
  autoConsent: boolean = false
): Proposed[] {
  const p = (profile ?? {}) as Record<string, unknown>;
  const ansMap = new Map(
    ((answers ?? []) as { question: string; answer: string }[]).map((a) => [a.question.toLowerCase().trim(), a.answer])
  );

  const findAnswer = (pattern: RegExp) => {
    for (const [q, a] of ansMap.entries()) {
      if (pattern.test(q)) return a;
    }
    return null;
  };

  const whyAnswer =
    findAnswer(/why.*attend|motivation|reason/i) ??
    "To collaborate with fellow engineers, learn from mentors, and build impactful solutions.";

  return [
    { label: "Full Name", kind: "text", form_kind: "text", value: (p.full_name as string) || "", source: p.full_name ? "profile.full_name" : "needs_user", confidence: p.full_name ? 1 : 0, required: true },
    { label: "College Email", kind: "email", form_kind: "email", value: (p.email as string) || "", source: p.email ? "profile.email" : "needs_user", confidence: p.email ? 1 : 0, required: true },
    { label: "Phone", kind: "tel", form_kind: "tel", value: (p.phone as string) || "", source: p.phone ? "profile.phone" : "needs_user", confidence: p.phone ? 1 : 0, required: true },
    { label: "College / University", kind: "text", form_kind: "text", value: (p.organization as string) || "", source: p.organization ? "profile.organization" : "needs_user", confidence: p.organization ? 1 : 0, required: true },
    { label: "City", kind: "text", form_kind: "text", value: (p.city as string) || "", source: p.city ? "profile.city" : "needs_user", confidence: p.city ? 1 : 0, required: true },
    { label: "GitHub Profile", kind: "url", form_kind: "url", value: (p.github_url as string) || "", source: p.github_url ? "profile.github_url" : "needs_user", confidence: p.github_url ? 1 : 0, required: false },
    { label: "T-shirt Size", kind: "select", form_kind: "select", value: (p.tshirt_size as string) || "M", source: "profile.tshirt_size", confidence: 1, required: false, options: ["S", "M", "L", "XL", "XXL"] },
    { label: "Why do you want to attend?", kind: "textarea", form_kind: "textarea", value: whyAnswer, source: "saved answer", confidence: 0.95, required: true },
    { label: "Team Name", kind: "text", form_kind: "text", value: "", source: "needs_user", confidence: 0, required: false },
    { label: "I agree to the code of conduct", kind: "consent", form_kind: "checkbox", value: autoConsent ? "yes" : "", source: autoConsent ? "auto_consent" : "consent", confidence: autoConsent ? 1 : 0, required: true },
  ];
}
