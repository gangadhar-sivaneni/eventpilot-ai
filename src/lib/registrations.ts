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
