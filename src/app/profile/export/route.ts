import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";

// "Download my data": everything we hold about the signed-in user, as JSON.
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const tables = ["profiles", "user_preferences", "registration_answers", "saved_searches", "event_alerts", "registrations"];
  const rows = await Promise.all(tables.map((t) => supabase.from(t).select("*").eq("user_id", user.id)));
  const body = Object.fromEntries(tables.map((t, i) => [t, rows[i].data ?? []]));
  return new NextResponse(JSON.stringify({ exported_at: new Date().toISOString(), ...body }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="eventpilot-my-data.json"',
    },
  });
}
