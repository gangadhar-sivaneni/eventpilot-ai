import { NextRequest, NextResponse } from "next/server";
import { savePushSubscription, removePushSubscription, sendPushToSubscription } from "@/lib/push";
import { getUser } from "@/lib/auth";
import { isValidPushEndpoint } from "@/lib/security";

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

    // 3. IDOR / Spoofing Defense: obtain user ID from authenticated session only
    const { user } = await getUser().catch(() => ({ user: null }));
    const authenticatedUserId = user?.id || null;

    // 4. Sanitize categories
    const safeCategories = Array.isArray(categories)
      ? categories
          .filter((c): c is string => typeof c === "string" && c.length <= 50)
          .slice(0, 10)
      : [];

    await savePushSubscription({
      endpoint,
      expirationTime: typeof subscription.expirationTime === "number" ? subscription.expirationTime : null,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      categories: safeCategories,
      user_id: authenticatedUserId,
    });

    // Optionally send an immediate welcome push to confirm activation
    if (sendWelcome) {
      try {
        await sendPushToSubscription(
          {
            endpoint,
            keys: { p256dh: keys.p256dh, auth: keys.auth },
          },
          {
            title: "⚡ EventPilot Alerts Active",
            body: "You will now receive instant lock-screen alerts for new hackathons, conferences & deadlines!",
            url: "/events",
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
