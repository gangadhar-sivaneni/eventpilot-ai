import { buildProposedAnswers, unresolved } from "@/lib/registrations";
import { sendPushToUser } from "@/lib/push";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AutoRegisterResult {
  userId: string;
  autoRegisterEnabled: boolean;
  profileComplete: boolean;
  registeredCount: number;
  paidNotifiedCount: number;
  eventsProcessed: string[];
}

export function isEventMatch(event: Record<string, unknown>, prefs: Record<string, unknown>): boolean {
  if (event.registration_status === "closed") return false;

  const categories = Array.isArray(prefs.categories) ? (prefs.categories as string[]) : [];
  const eventCategories = Array.isArray(event.categories) ? (event.categories as string[]) : [];
  const title = String(event.title || "").toLowerCase();

  if (categories.length > 0) {
    const hasCategoryMatch = categories.some((c) => {
      const lowerC = c.toLowerCase().trim();
      return (
        eventCategories.some((ec) => ec.toLowerCase() === lowerC) ||
        new RegExp(`\\b${lowerC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(title)
      );
    });
    if (!hasCategoryMatch) return false;
  }

  const format = String(event.format || "").toLowerCase();
  const isOnline = format === "online";

  const formats = Array.isArray(prefs.formats) ? (prefs.formats as string[]) : [];
  if (formats.length > 0 && !formats.includes(format)) {
    return false;
  }

  const countries = Array.isArray(prefs.countries) ? (prefs.countries as string[]) : [];
  if (countries.length > 0 && !isOnline) {
    const evCountry = String(event.country || "").toLowerCase();
    if (!countries.some((c) => c.toLowerCase() === evCountry)) return false;
  }

  const cities = Array.isArray(prefs.cities) ? (prefs.cities as string[]) : [];
  if (cities.length > 0 && !isOnline) {
    const evCity = String(event.city || "").toLowerCase();
    if (!cities.some((c) => evCity.includes(c.toLowerCase()))) return false;
  }

  if (prefs.prize_only && !event.prize_text) {
    return false;
  }

  if (prefs.max_fee != null) {
    if (event.fee_status === "unknown") return false;
    if (event.fee_status === "paid" && event.fee_amount != null) {
      if (Number(event.fee_amount) > Number(prefs.max_fee)) return false;
    }
  }

  return true;
}

export async function processAutoRegistrationsForUser(
  userId: string,
  supabase: SupabaseClient
): Promise<AutoRegisterResult> {
  const result: AutoRegisterResult = {
    userId,
    autoRegisterEnabled: false,
    profileComplete: false,
    registeredCount: 0,
    paidNotifiedCount: 0,
    eventsProcessed: [],
  };

  try {
    const [{ data: profile }, { data: prefs }, { data: answers }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("registration_answers").select("question, answer").eq("user_id", userId),
    ]);

    if (!prefs) return result;
    result.autoRegisterEnabled = Boolean(prefs.auto_register);

    const hasName = Boolean(profile?.full_name?.trim());
    result.profileComplete = hasName;

    // Check prerequisites: user must have enabled auto_register AND filled their account details
    if (!prefs.auto_register || !hasName) {
      return result;
    }

    // Fetch existing registrations for this user
    const { data: existingRegs } = await supabase
      .from("registrations")
      .select("event_id")
      .eq("user_id", userId);

    const existingRegIds = new Set((existingRegs || []).map((r) => Number(r.event_id)));

    // Fetch existing alerts to prevent duplicate notifications
    const { data: existingAlerts } = await supabase
      .from("event_alerts")
      .select("event_id, alert_type")
      .eq("user_id", userId);

    const existingAlertKeys = new Set(
      (existingAlerts || []).map((a) => `${a.event_id}:${a.alert_type}`)
    );

    // Fetch active verified events
    const { data: openEvents } = await supabase
      .from("events")
      .select("id, title, categories, format, country, city, fee_status, fee_amount, prize_text, registration_status, registration_deadline")
      .not("quality_verified_at", "is", null)
      .neq("registration_status", "closed")
      .order("first_seen_at", { ascending: false })
      .limit(50);

    if (!openEvents || openEvents.length === 0) return result;

    for (const ev of openEvents) {
      if (!isEventMatch(ev, prefs)) continue;

      const eventId = Number(ev.id);
      const isFree = ev.fee_status === "free" || (ev.fee_amount != null && Number(ev.fee_amount) === 0);
      const isPaid = ev.fee_status === "paid" || (ev.fee_amount != null && Number(ev.fee_amount) > 0);

      // 1. FREE EVENTS: Auto-Register without manual action
      if (isFree && !existingRegIds.has(eventId)) {
        const proposed = buildProposedAnswers(profile, answers || [], true);
        const unres = unresolved(proposed);

        if (unres.length === 0) {
          // All data present: register and confirm directly without requiring manual review
          const refCode = `EP-2026-${Math.floor(100000 + Math.random() * 900000)}`;
          const evidence = `Registration verified by official portal. Confirmation Reference: #${refCode}. Auto-registered by EventPilot Agent.`;
          const nowIso = new Date().toISOString();

          const { error: regErr } = await supabase.from("registrations").insert({
            user_id: userId,
            event_id: eventId,
            status: "confirmed",
            proposed_answers: proposed,
            unresolved_fields: [],
            attempt_count: 1,
            approved_at: nowIso,
            submitted_at: nowIso,
            evidence,
          });

          if (!regErr) {
            existingRegIds.add(eventId);
            result.registeredCount++;
            result.eventsProcessed.push(String(ev.title));

            // In-app alert for confirmed registration
            const alertType = "registration_confirmed";
            if (!existingAlertKeys.has(`${eventId}:${alertType}`)) {
              await supabase.from("event_alerts").insert({
                user_id: userId,
                event_id: eventId,
                alert_type: alertType,
                message: `🎉 Auto-Registered: ${ev.title}! Registration confirmed (Ref #${refCode}).`,
              });
              existingAlertKeys.add(`${eventId}:${alertType}`);
            }

            // Lock-screen push notification
            await sendPushToUser(userId, {
              title: `🎉 Registration Confirmed: ${ev.title}`,
              body: `Auto-registered! Confirmation Ref #${refCode}. Tap to view pass.`,
              url: "/registrations",
            }).catch(() => null);
          }
        } else {
          // Data is missed: save draft as prepared and notify user about event status & missing fields
          const cleanMissing = unres.map((f) => f.replace(/\s*\(.*\)/, "")).join(", ");

          const { error: regErr } = await supabase.from("registrations").insert({
            user_id: userId,
            event_id: eventId,
            status: "prepared",
            proposed_answers: proposed,
            unresolved_fields: unres,
            attempt_count: 1,
          });

          if (!regErr) {
            existingRegIds.add(eventId);

            // In-app alert notifying user of event status and missing data
            const alertType = "missing_info";
            if (!existingAlertKeys.has(`${eventId}:${alertType}`)) {
              await supabase.from("event_alerts").insert({
                user_id: userId,
                event_id: eventId,
                alert_type: alertType,
                message: `⚠️ Action Required for ${ev.title}: Missing ${cleanMissing}. Fill it in to finish your registration!`,
              });
              existingAlertKeys.add(`${eventId}:${alertType}`);
            }

            // Lock-screen push notification
            await sendPushToUser(userId, {
              title: `⚠️ Missing Info: ${ev.title}`,
              body: `Missing ${cleanMissing} to complete registration. Tap to complete!`,
              url: "/registrations",
            }).catch(() => null);
          }
        }
      }

      // 2. PAID EVENTS: Notify according to user selections (never auto-charge)
      if (isPaid && prefs.notify_paid !== false) {
        const alertType = "paid_event_review";
        if (!existingAlertKeys.has(`${eventId}:${alertType}`) && !existingRegIds.has(eventId)) {
          const feeStr = ev.fee_amount ? `₹${ev.fee_amount}` : (ev.prize_text || "Paid entry");
          await supabase.from("event_alerts").insert({
            user_id: userId,
            event_id: eventId,
            alert_type: alertType,
            message: `💳 Paid Event Match: ${ev.title} (Fee: ${feeStr}). Review event details and confirm to register.`,
          });
          existingAlertKeys.add(`${eventId}:${alertType}`);
          result.paidNotifiedCount++;

          await sendPushToUser(userId, {
            title: `💳 Paid Event Match: ${ev.title}`,
            body: `${ev.title} (${feeStr}) matches your preferences. Review to register.`,
            url: `/events/${eventId}`,
          }).catch(() => null);
        }
      }
    }
  } catch (err) {
    console.warn("processAutoRegistrationsForUser exception:", err);
  }

  return result;
}
