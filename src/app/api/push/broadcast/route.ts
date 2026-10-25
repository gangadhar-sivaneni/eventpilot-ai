import { NextRequest, NextResponse } from "next/server";
import { broadcastPushNotification } from "@/lib/push";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const expectedKey = process.env.CRON_SECRET || "eventpilot_cron_10m";
    const providedKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    // Check authorization unless triggered in local/demo environment
    if (process.env.CRON_SECRET && providedKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { title, body: content, url } = body;

    if (!title || !content) {
      return NextResponse.json({ error: "Title and body are required" }, { status: 400 });
    }

    const result = await broadcastPushNotification({
      title,
      body: content,
      url: url || "/events",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
