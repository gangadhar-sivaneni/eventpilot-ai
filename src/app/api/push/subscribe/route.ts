import { NextRequest, NextResponse } from "next/server";
import { savePushSubscription, removePushSubscription, sendPushToSubscription } from "@/lib/push";
import { getUser } from "@/lib/auth";
import { isValidPushEndpoint } from "@/lib/security";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { subscription, categories, sendWelcome } = body;

    if (!subscription || typeof subscription !== "object") {
      return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
    }

    const { endpoint, keys } = subscription;

    // 1. SSRF Defense: validate that the push service endpoint is a legitimate HTTPS web-push endpoint
    if (!endpoint || typeof endpoint !== "string" || !isValidPushEndpoint(endpoint)) {
      return NextResponse.json(
        { error: "Invalid or unsupported push notification service endpoint" },
        { status: 400 }
      );
    }

    // 2. Validate cryptographic key parameters
    if (!keys || typeof keys !== "object" || !keys.p256dh || !keys.auth) {
      return NextResponse.json({ error: "Missing cryptographic keys" }, { status: 400 });
    }

    if (
      typeof keys.p256dh !== "string" ||
      keys.p256dh.length > 256 ||
      typeof keys.auth !== "string" ||
      keys.auth.length > 128
    ) {
      return NextResponse.json({ error: "Invalid key format" }, { status: 400 });
    }

    // 3. Obtain user ID from authenticated session with validated fallback
    const { user } = await getUser().catch(() => ({ user: null }));
    const authenticatedUserId = user?.id || null;
    const bodyUserId = typeof body.userId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId)
      ? body.userId
      : null;
    const effectiveUserId = authenticatedUserId || bodyUserId || null;

    // 4. Sanitize categories (defaults to 'all' if not specified)
    const rawCategories = Array.isArray(categories) && categories.length > 0 ? categories : ["all"];
    const safeCategories = rawCategories
      .filter((c): c is string => typeof c === "string" && c.length <= 50)
      .slice(0, 10);
    const finalCategories = safeCategories.length > 0 ? safeCategories : ["all"];

    await savePushSubscription({
      endpoint,
      expirationTime: typeof subscription.expirationTime === "number" ? subscription.expirationTime : null,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      categories: finalCategories,
      user_id: effectiveUserId,
    });

    // Optionally send an immediate welcome push to confirm activation with a real verified event
    if (sendWelcome) {
      try {
        const admin = getAdminClient();
        const dbClient = admin || (await createClient().catch(() => null));
        let title = "⚡ EventPilot Alerts Active";
        let body = "You will now receive instant lock-screen alerts for new hackathons, conferences & deadlines!";
        let url = "/events";

        if (dbClient) {
          const { data: topEvent } = await dbClient
            .from("events")
            .select("id, title, city, format, prize_text")
            .not("quality_verified_at", "is", null)
            .neq("registration_status", "closed")
            .order("first_seen_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (topEvent) {
            const location = topEvent.city || (topEvent.format === "online" ? "Online" : "India");
            const prizeInfo = topEvent.prize_text ? ` · Prize: ${topEvent.prize_text}` : "";
            title = `⚡ Verified Hackathon: ${topEvent.title}`;
            body = `${location}${prizeInfo} — Registration open now. Tap to view!`;
            url = `/events/${topEvent.id}`;
          }
        }

        await sendPushToSubscription(
          {
            endpoint,
            keys: { p256dh: keys.p256dh, auth: keys.auth },
          },
          {
            title,
            body,
            url,
            icon: "/icon-192.png",
            badge: "/badge.png",
          }
        );
      } catch (pushErr) {
        console.warn("Welcome push notification failed:", pushErr);
      }
    }

    return NextResponse.json({ success: true, message: "Subscription saved successfully" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { endpoint } = body;

    if (!endpoint || typeof endpoint !== "string" || !isValidPushEndpoint(endpoint)) {
      return NextResponse.json({ error: "Valid endpoint is required" }, { status: 400 });
    }

    await removePushSubscription(endpoint);
    return NextResponse.json({ success: true, message: "Subscription removed successfully" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
