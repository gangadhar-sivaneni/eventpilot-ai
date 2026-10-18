"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { MANUAL_KINDS, unresolved, type Proposed } from "@/lib/registrations";

const EDITABLE = ["prepared", "awaiting_approval"];

async function load(form: FormData) {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("registrations")
    .select("id, status, proposed_answers, events(fee_status, fee_amount)")
    .eq("id", Number(form.get("id")))
    .single(); // RLS: only the owner's row comes back
  if (!data) throw new Error("Registration not found");
  return { supabase, reg: data };
}

export async function saveAnswers(form: FormData) {
  const { supabase, reg } = await load(form);
  if (!EDITABLE.includes(reg.status)) throw new Error("Answers can only be edited before submission");
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
  if (!EDITABLE.includes(reg.status)) throw new Error("Nothing to approve");
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
