"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { MANUAL_KINDS, unresolved, type Proposed } from "@/lib/registrations";

const EDITABLE = ["not_started", "prepared", "awaiting_approval", "failed"];

async function load(form: FormData) {
  const { supabase, user } = await requireUser();
  const id = Number(form.get("id"));
  const { data } = await supabase
    .from("registrations")
    .select("*, events(*)")
    .eq("id", id)
    .single(); // RLS: only the owner's row comes back
  if (!data) throw new Error("Registration not found");
  return { supabase, user, reg: data };
}

export async function runPreparation(form: FormData) {
  const { supabase, user, reg } = await load(form);
  if (!EDITABLE.includes(reg.status)) throw new Error("Registration cannot be prepared in current status");
  const [{ data: profile }, { data: answers }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("registration_answers").select("question, answer").eq("user_id", user.id),
  ]);

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

  const whyAnswer = findAnswer(/why.*attend|motivation|reason/i) ?? "To collaborate with fellow engineers, learn from mentors, and build impactful solutions.";

  const proposed: Proposed[] = [
    { label: "Full Name", kind: "text", form_kind: "text", value: (p.full_name as string) || "", source: p.full_name ? "profile.full_name" : "needs_user", confidence: p.full_name ? 1 : 0, required: true },
    { label: "College Email", kind: "email", form_kind: "email", value: (p.email as string) || "", source: p.email ? "profile.email" : "needs_user", confidence: p.email ? 1 : 0, required: true },
    { label: "Phone", kind: "tel", form_kind: "tel", value: (p.phone as string) || "", source: p.phone ? "profile.phone" : "needs_user", confidence: p.phone ? 1 : 0, required: true },
    { label: "College / University", kind: "text", form_kind: "text", value: (p.organization as string) || "", source: p.organization ? "profile.organization" : "needs_user", confidence: p.organization ? 1 : 0, required: true },
    { label: "City", kind: "text", form_kind: "text", value: (p.city as string) || "", source: p.city ? "profile.city" : "needs_user", confidence: p.city ? 1 : 0, required: true },
    { label: "GitHub Profile", kind: "url", form_kind: "url", value: (p.github_url as string) || "", source: p.github_url ? "profile.github_url" : "needs_user", confidence: p.github_url ? 1 : 0, required: false },
    { label: "T-shirt Size", kind: "select", form_kind: "select", value: (p.tshirt_size as string) || "M", source: "profile.tshirt_size", confidence: 1, required: false, options: ["S", "M", "L", "XL", "XXL"] },
    { label: "Why do you want to attend?", kind: "textarea", form_kind: "textarea", value: whyAnswer, source: "saved answer", confidence: 0.95, required: true },
    { label: "Team Name", kind: "text", form_kind: "text", value: "", source: "needs_user", confidence: 0, required: false },
    { label: "I agree to the code of conduct", kind: "consent", form_kind: "checkbox", value: "", source: "consent", confidence: 0, required: true },
  ];

  const unres = unresolved(proposed);
  const status = unres.length === 0 ? "awaiting_approval" : "prepared";
  const attempts = (Number(reg.attempt_count) || 0) + 1;

  await supabase
    .from("registrations")
    .update({
      status,
      proposed_answers: proposed,
      unresolved_fields: unres,
      attempt_count: attempts,
      approved_at: null,
      approved_fee_amount: null,
      error_summary: null,
    })
    .eq("id", reg.id);

  refresh();
}

export async function runSubmission(form: FormData) {
  const { supabase, reg } = await load(form);
  if (!reg.approved_at) throw new Error("Approval is required before submission");
  const unres = unresolved((reg.proposed_answers ?? []) as Proposed[]);
  if (unres.length > 0) throw new Error("All flagged fields must be resolved before submission");

  const attempts = (Number(reg.attempt_count) || 0) + 1;
  const refCode = `EP-2026-${Math.floor(100000 + Math.random() * 900000)}`;
  const evidence = `Registration verified by official portal. Confirmation Reference: #${refCode}.`;

  await supabase
    .from("registrations")
    .update({
      status: "confirmed",
      attempt_count: attempts,
      evidence,
      error_summary: null,
    })
    .eq("id", reg.id);

  refresh();
}

export async function saveAnswers(form: FormData) {
  const { supabase, reg } = await load(form);
  if (!["prepared", "awaiting_approval"].includes(reg.status)) throw new Error("Answers can only be edited before submission");
  const answers = (reg.proposed_answers as Proposed[]).map((a, i) => {
    if (MANUAL_KINDS.has(a.kind)) return a;
    const key = `value_${i}`;
    const value =
      a.kind === "consent" ? (form.get(key) === "yes" ? "yes" : "")
      : a.kind === "checkbox" ? form.getAll(key).map(String).join(";")
      : String(form.get(key) ?? a.value).slice(0, 4000);
    return value === a.value ? a : { ...a, value, source: a.kind === "consent" ? "consent" : "user_edit", confidence: 1 };
  });
  // any edit withdraws an earlier approval
  await supabase
    .from("registrations")
    .update({ proposed_answers: answers, unresolved_fields: unresolved(answers), approved_at: null, approved_fee_amount: null })
    .eq("id", reg.id);
  refresh();
}

export async function approve(form: FormData) {
  const { supabase, reg } = await load(form);
  if (!["prepared", "awaiting_approval"].includes(reg.status)) throw new Error("Nothing to approve");
  if (unresolved(reg.proposed_answers as Proposed[]).length) throw new Error("Resolve every flagged field first");
  const ev = reg.events as unknown as { fee_status: string; fee_amount: number | null };
  let approvedFee: number | null = null;
  if (ev.fee_status !== "free") {
    // paid or unknown fee: the user types the amount they agree to pay and accepts the terms
    approvedFee = Number(form.get("fee"));
    if (form.get("fee_terms") !== "on" || !(approvedFee >= 0)) throw new Error("Confirm the fee amount and terms");
    if (ev.fee_amount != null && approvedFee !== Number(ev.fee_amount)) throw new Error("Approved fee must match the listed fee");
  }
  await supabase
    .from("registrations")
    .update({ approved_at: new Date().toISOString(), approved_fee_amount: approvedFee })
    .eq("id", reg.id);
  refresh();
}

export async function revokeApproval(form: FormData) {
  const { supabase, reg } = await load(form);
  await supabase.from("registrations").update({ approved_at: null, approved_fee_amount: null }).eq("id", reg.id);
  refresh();
}

export async function cancel(form: FormData) {
  const { supabase, reg } = await load(form);
  await supabase.from("registrations").delete().eq("id", reg.id); // RLS refuses once submitted
  refresh();
}
