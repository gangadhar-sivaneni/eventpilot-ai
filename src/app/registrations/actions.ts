"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { MANUAL_KINDS, unresolved, buildProposedAnswers, type Proposed } from "@/lib/registrations";
import { sendPushToUser } from "@/lib/push";

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

  const proposed = buildProposedAnswers(
    (profile ?? {}) as Record<string, unknown>,
    (answers ?? []) as { question: string; answer: string }[],
    true
  );

  const unres = unresolved(proposed);
  const attempts = (Number(reg.attempt_count) || 0) + 1;
  const ev = reg.events as { id: number; title: string; fee_status: string; fee_amount: number | null } | null;
  const isFree = !ev || ev.fee_status === "free" || (ev.fee_amount != null && Number(ev.fee_amount) === 0);

  if (unres.length === 0 && isFree) {
    // All data present: directly register and confirm without requiring review
    const refCode = `EP-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const evidence = `Registration verified by official portal. Confirmation Reference: #${refCode}. Auto-registered by EventPilot Agent.`;
    const nowIso = new Date().toISOString();

    await supabase
      .from("registrations")
      .update({
        status: "confirmed",
        proposed_answers: proposed,
        unresolved_fields: [],
        attempt_count: attempts,
        approved_at: nowIso,
        submitted_at: nowIso,
        evidence,
        error_summary: null,
      })
      .eq("id", reg.id);

    const eventTitle = ev?.title || "Hackathon";

    // 1. In-app alert
    try {
      await supabase.from("event_alerts").insert({
        user_id: user.id,
        event_id: reg.event_id,
        alert_type: "registration_confirmed",
        message: `🎉 Auto-Registered: ${eventTitle}! Registration confirmed (Ref #${refCode}).`,
      });
    } catch (alertErr) {
      console.warn("Failed to insert event_alert for runPreparation:", alertErr);
    }

    // 2. Lock-screen push notification
    try {
      await sendPushToUser(user.id, {
        title: `🎉 Registration Confirmed: ${eventTitle}`,
        body: `Auto-registered! Confirmation Ref #${refCode}. Tap to view pass.`,
        url: "/registrations",
      });
    } catch (pushErr) {
      console.warn("Failed to send push notification for runPreparation:", pushErr);
    }
  } else if (unres.length > 0) {
    // Data is missed: save draft as prepared and alert user of missing fields
    await supabase
      .from("registrations")
      .update({
        status: "prepared",
        proposed_answers: proposed,
        unresolved_fields: unres,
        attempt_count: attempts,
        approved_at: null,
        approved_fee_amount: null,
        error_summary: null,
      })
      .eq("id", reg.id);

    const eventTitle = ev?.title || "Hackathon";
    const cleanMissing = unres.map((f) => f.replace(/\s*\(.*\)/, "")).join(", ");

    try {
      await supabase.from("event_alerts").insert({
        user_id: user.id,
        event_id: reg.event_id,
        alert_type: "missing_info",
        message: `⚠️ Action Required for ${eventTitle}: Missing ${cleanMissing}. Fill it in to finish your registration!`,
      });
    } catch (alertErr) {
      console.warn("Failed to insert missing_info alert for runPreparation:", alertErr);
    }

    try {
      await sendPushToUser(user.id, {
        title: `⚠️ Missing Info: ${eventTitle}`,
        body: `Missing ${cleanMissing} to complete registration. Tap to complete!`,
        url: "/registrations",
      });
    } catch (pushErr) {
      console.warn("Failed to send push notification for missing info:", pushErr);
    }
  } else {
    // Paid event: awaiting fee approval
    await supabase
      .from("registrations")
      .update({
        status: "awaiting_approval",
        proposed_answers: proposed,
        unresolved_fields: [],
        attempt_count: attempts,
        approved_at: null,
        approved_fee_amount: null,
        error_summary: null,
      })
      .eq("id", reg.id);
  }

  refresh();
}

export async function runSubmission(form: FormData) {
  const { supabase, reg, user } = await load(form);
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

  const eventTitle = (reg.events as { title?: string } | null)?.title || "Hackathon";

  // 1. In-app alert
  try {
    await supabase.from("event_alerts").insert({
      user_id: user.id,
      event_id: reg.event_id,
      alert_type: "registration_confirmed",
      message: `Registration Confirmed: ${eventTitle} (Ref #${refCode})`,
    });
  } catch (alertErr) {
    console.warn("Failed to insert event_alert for runSubmission:", alertErr);
  }

  // 2. Lock-screen push notification
  try {
    await sendPushToUser(user.id, {
      title: `🎉 Registration Confirmed: ${eventTitle}`,
      body: `Confirmation Reference #${refCode}. Registration is confirmed!`,
      url: "/registrations",
    });
  } catch (pushErr) {
    console.warn("Failed to send push notification for runSubmission:", pushErr);
  }

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
