"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";

export async function markRead(form: FormData) {
  const { supabase } = await requireUser();
  const id = form.get("id");
  let q = supabase.from("event_alerts").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (id) q = q.eq("id", Number(id)); // no id = mark all read (RLS limits it to this user)
  await q;
  refresh();
}
