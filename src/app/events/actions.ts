"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { FILTER_KEYS } from "@/lib/events";

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
  const { supabase } = await requireUser();
  const eventId = Number(form.get("event_id"));
  if (!Number.isInteger(eventId)) redirect("/events");
  // unique(user_id, event_id) makes double clicks harmless
  const { error } = await supabase.from("registrations").insert({ event_id: eventId });
  if (error && error.code !== "23505") throw new Error("Could not start registration");
  redirect("/registrations");
}
