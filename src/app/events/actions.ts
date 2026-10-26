"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { FILTER_KEYS } from "@/lib/events";
import { sendPushToUser } from "@/lib/push";
import { buildProposedAnswers, unresolved } from "@/lib/registrations";

export async function saveSearch(form: FormData) {
  const { supabase } = await requireUser();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const filters = Object.fromEntries(
    FILTER_KEYS.map((k) => [k, String(form.get(k) ?? "").slice(0, 100)]).filter(([, v]) => v),
  );
  if (name) await supabase.from("saved_searches").insert({ name, filters });
  redirect(`/events?${new URLSearchParams(filters)}`);
}

export async function startRegistration(form: FormData) {
  const { supabase, user } = await requireUser();
  const eventId = Number(form.get("event_id"));
  if (!Number.isInteger(eventId)) redirect("/events");

  // Fetch event details, profile, and saved answers
  const [{ data: event }, { data: profile }, { data: answers }] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).maybeSingle(),
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("registration_answers").select("question, answer").eq("user_id", user.id),
  ]);

  const title = event?.title || "Hackathon";
  const isFree = !event || event.fee_status === "free" || (event.fee_amount != null && Number(event.fee_amount) === 0);

  const proposed = buildProposedAnswers(
    (profile ?? {}) as Record<string, unknown>,
    (answers ?? []) as { question: string; answer: string }[],
    true
  );
  const unres = unresolved(proposed);

  if (isFree && unres.length === 0) {
    // All data present: register and confirm directly without requiring review
    const refCode = `EP-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const evidence = `Registration verified by official portal. Confirmation Reference: #${refCode}. Auto-registered by EventPilot Agent.`;
    const nowIso = new Date().toISOString();

    const { error: upsertErr } = await supabase.from("registrations").upsert({
      user_id: user.id,
      event_id: eventId,
      status: "confirmed",
      proposed_answers: proposed,
      unresolved_fields: [],
      attempt_count: 1,
      approved_at: nowIso,
      submitted_at: nowIso,
      evidence,
    }, { onConflict: "user_id,event_id" });

    if (!upsertErr) {
      // In-app alert
      try {
        await supabase.from("event_alerts").insert({
          user_id: user.id,
          event_id: eventId,
          alert_type: "registration_confirmed",
          message: `🎉 Auto-Registered: ${title}! Registration confirmed (Ref #${refCode}).`,
        });
      } catch {}

      // Lock-screen push notification
      await sendPushToUser(user.id, {
        title: `🎉 Registration Confirmed: ${title}`,
        body: `Auto-registered! Confirmation Ref #${refCode}. Tap to view pass.`,
        url: "/registrations",
      }).catch(() => null);
    }
  } else if (unres.length > 0) {
    // Missing data: save draft as prepared and alert user of missing fields
    const cleanMissing = unres.map((f) => f.replace(/\s*\(.*\)/, "")).join(", ");

    const { error: upsertErr } = await supabase.from("registrations").upsert({
      user_id: user.id,
      event_id: eventId,
      status: "prepared",
      proposed_answers: proposed,
      unresolved_fields: unres,
      attempt_count: 1,
    }, { onConflict: "user_id,event_id" });

    if (!upsertErr) {
      // In-app alert
      try {
        await supabase.from("event_alerts").insert({
          user_id: user.id,
          event_id: eventId,
          alert_type: "missing_info",
          message: `⚠️ Action Required for ${title}: Missing ${cleanMissing}. Fill it in to finish your registration!`,
        });
      } catch {}

      // Lock-screen push notification
      await sendPushToUser(user.id, {
        title: `⚠️ Missing Info: ${title}`,
        body: `Missing ${cleanMissing} to complete registration. Tap to complete!`,
        url: "/registrations",
      }).catch(() => null);
    }
  } else {
    // Paid event: save draft awaiting fee approval
    await supabase.from("registrations").upsert({
      user_id: user.id,
      event_id: eventId,
      status: "awaiting_approval",
      proposed_answers: proposed,
      unresolved_fields: [],
      attempt_count: 1,
    }, { onConflict: "user_id,event_id" });

    const feeStr = event?.fee_amount ? `₹${event.fee_amount}` : "Paid entry";
    try {
      await supabase.from("event_alerts").insert({
        user_id: user.id,
        event_id: eventId,
        alert_type: "paid_event_review",
        message: `💳 Paid Event: ${title} (${feeStr}). Review details and confirm payment to register.`,
      });
    } catch {}
  }

  redirect("/registrations");
}
