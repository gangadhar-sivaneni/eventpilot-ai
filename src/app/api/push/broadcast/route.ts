import { NextRequest, NextResponse } from "next/server";
import { broadcastPushNotification } from "@/lib/push";
import { getUser } from "@/lib/auth";
import { timingSafeCompare } from "@/lib/security";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const providedKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    let isAuthorized = false;

    // 1. Check Bearer token against CRON_SECRET using constant-time comparison
    if (cronSecret && providedKey && timingSafeCompare(providedKey, cronSecret)) {
      isAuthorized = true;
    } else if (!cronSecret && process.env.NODE_ENV !== "production") {
      // Local dev fallback only
      if (providedKey === "eventpilot_cron_10m") {
        isAuthorized = true;
      }
    }

    // 2. Also allow authenticated admin session
    if (!isAuthorized) {
      const { user } = await getUser().catch(() => ({ user: null }));
      if (user?.app_metadata?.role === "admin") {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { title, body: content, url, category } = body;

    if (!title || typeof title !== "string" || !content || typeof content !== "string") {
      return NextResponse.json({ error: "Title and body are required string fields" }, { status: 400 });
    }

    if (title.length > 200 || content.length > 500) {
      return NextResponse.json({ error: "Payload exceeds length limits" }, { status: 400 });
    }

    const safeUrl = typeof url === "string" && (url.startsWith("/") || url.startsWith("https://"))
      ? url.slice(0, 1000)
      : "/events";

    const result = await broadcastPushNotification({
      title: title.slice(0, 200),
      body: content.slice(0, 500),
      url: safeUrl,
      category: typeof category === "string" ? category.slice(0, 50) : undefined,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
