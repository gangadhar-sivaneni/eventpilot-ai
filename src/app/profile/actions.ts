"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { list, validateProfile } from "@/lib/profile";
import { processAutoRegistrationsForUser } from "@/lib/auto-register";

const back = (q: string) => redirect(`/profile?${q}`);

export async function saveProfile(form: FormData) {
  const { supabase, user } = await requireUser();
  const [values, error] = validateProfile(form);
  if (error) back(`error=${encodeURIComponent(error)}`);
  const { error: dbError } = await supabase.from("profiles").update(values).eq("user_id", user.id);
  if (!dbError) {
    // If auto_register is active, immediately start registering matching events with newly saved account details
    await processAutoRegistrationsForUser(user.id, supabase).catch(() => null);
  }
  back(dbError ? `error=${encodeURIComponent("Could not save profile")}` : "saved=profile");
}

export async function savePreferences(form: FormData) {
  const { supabase, user } = await requireUser();
  const maxFee = String(form.get("max_fee") ?? "").trim();
  if (maxFee && !(Number(maxFee) >= 0)) back(`error=${encodeURIComponent("Max fee must be 0 or more")}`);
  const formats = form.getAll("formats").map(String).filter((f) => ["online", "in_person", "hybrid"].includes(f));
  const on = (k: string) => form.get(k) === "on";
  const autoRegister = on("auto_register");
  const notifyPaid = form.get("notify_paid") === null ? true : on("notify_paid");

  const { error } = await supabase
    .from("user_preferences")
    .update({
      categories: list(form.get("categories"), true),
      countries: list(form.get("countries")),
      cities: list(form.get("cities")),
      formats,
      max_fee: maxFee ? Number(maxFee) : null,
      prize_only: on("prize_only"),
      alert_new_event: on("alert_new_event"),
      alert_registration_opened: on("alert_registration_opened"),
      alert_deadline_reminder: on("alert_deadline_reminder"),
      alert_availability_changed: on("alert_availability_changed"),
      email_alerts: on("email_alerts"),
      auto_register: autoRegister,
      notify_paid: notifyPaid,
    })
    .eq("user_id", user.id);

  if (!error && autoRegister) {
    // Automatically prepare registrations for matching free events
    await processAutoRegistrationsForUser(user.id, supabase).catch(() => null);
  }

  back(error ? `error=${encodeURIComponent("Could not save preferences")}` : "saved=preferences");
}

export async function saveAnswer(form: FormData) {
  const { supabase, user } = await requireUser();
  const question = String(form.get("question") ?? "").trim();
  const answer = String(form.get("answer") ?? "").trim();
  if (question.length < 3 || question.length > 300 || answer.length > 4000)
    back(`error=${encodeURIComponent("Question must be 3–300 characters, answer up to 4000")}`);
  const { error } = await supabase
    .from("registration_answers")
    .upsert({ user_id: user.id, question, answer }, { onConflict: "user_id,question" });
  back(error ? `error=${encodeURIComponent("Could not save answer")}` : "saved=answer");
}

export async function deleteAnswer(form: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("registration_answers").delete().eq("id", Number(form.get("id")));
  back("saved=answer");
}

export async function deleteSavedSearch(form: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("saved_searches").delete().eq("id", Number(form.get("id")));
  back("saved=search");
}

export async function scheduleAccountDeletion(form: FormData) {
  const { supabase, user } = await requireUser();
  const password = String(form.get("password") ?? "").trim();
  if (!password) {
    back(`error=${encodeURIComponent("Password is required to request account deletion.")}`);
  }

  // Verify user password before scheduling deletion
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password,
  });

  if (authError) {
    back(`error=${encodeURIComponent("Incorrect password. Please verify your credentials to continue.")}`);
  }

  // Schedule deletion 5 days into the future
  const deletionDueAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const scheduledAt = new Date().toISOString();

  const { error: updateError } = await supabase.auth.updateUser({
    data: {
      deletion_scheduled_at: scheduledAt,
      deletion_due_at: deletionDueAt,
    },
  });

  if (updateError) {
    back(`error=${encodeURIComponent("Could not schedule account deletion. Please try again.")}`);
  }

  await supabase.auth.signOut();
  redirect(`/?scheduled_delete=1&due=${encodeURIComponent(deletionDueAt)}`);
}

export async function deleteAccount(form: FormData) {
  return scheduleAccountDeletion(form);
}

