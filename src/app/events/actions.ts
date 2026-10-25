"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { FILTER_KEYS } from "@/lib/events";
import { sendPushToUser } from "@/lib/push";

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
  // unique(user_id, event_id) makes double clicks harmless
  const { error } = await supabase.from("registrations").insert({ event_id: eventId });
  if (error && error.code !== "23505") throw new Error("Could not start registration");

  // Fetch event title for rich notification
  try {
    const { data: event } = await supabase
      .from("events")
      .select("title")
      .eq("id", eventId)
      .maybeSingle();

    const title = event?.title || "Hackathon";

    // 1. Record in-app notification in event_alerts
    await supabase.from("event_alerts").insert({
      user_id: user.id,
      event_id: eventId,
      alert_type: "registration_started",
      message: `Registration started for ${title}. Complete and submit your registration!`,
    });

    // 2. Dispatch lock-screen push notification to user's device
    await sendPushToUser(user.id, {
      title: `📝 Registration Started: ${title}`,
      body: "Your registration draft is active. Review details and confirm your seat!",
      url: "/registrations",
    });
  } catch (notifyErr) {
    console.warn("Notification dispatch warning in startRegistration:", notifyErr);
  }

  redirect("/registrations");
}
