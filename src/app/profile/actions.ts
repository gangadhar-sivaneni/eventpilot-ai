"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { list, validateProfile } from "@/lib/profile";

const back = (q: string) => redirect(`/profile?${q}`);

export async function saveProfile(form: FormData) {
  const { supabase, user } = await requireUser();
  const [values, error] = validateProfile(form);
  if (error) back(`error=${encodeURIComponent(error)}`);
  const { error: dbError } = await supabase.from("profiles").update(values).eq("user_id", user.id);
  back(dbError ? `error=${encodeURIComponent("Could not save profile")}` : "saved=profile");
}

export async function savePreferences(form: FormData) {
  const { supabase, user } = await requireUser();
  const maxFee = String(form.get("max_fee") ?? "").trim();
  if (maxFee && !(Number(maxFee) >= 0)) back(`error=${encodeURIComponent("Max fee must be 0 or more")}`);
  const formats = form.getAll("formats").map(String).filter((f) => ["online", "in_person", "hybrid"].includes(f));
  const on = (k: string) => form.get(k) === "on";
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
    })
    .eq("user_id", user.id);
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

export async function deleteAccount(form: FormData) {
  const { supabase } = await requireUser();
  if (form.get("confirm") !== "on") back(`error=${encodeURIComponent("Tick the confirmation box to delete your account")}`);
  const { error } = await supabase.rpc("delete_my_account");
  if (error) back(`error=${encodeURIComponent("Could not delete account")}`);
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
