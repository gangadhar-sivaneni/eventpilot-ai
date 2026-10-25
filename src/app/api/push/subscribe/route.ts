import { NextRequest, NextResponse } from "next/server";
import { savePushSubscription, removePushSubscription, sendPushToSubscription } from "@/lib/push";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { subscription, userId, categories, sendWelcome } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
    }

    await savePushSubscription({
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime,
      keys: subscription.keys,
      categories: Array.isArray(categories) ? categories : [],
      user_id: userId || null,
    });

    // Optionally send an immediate welcome push to confirm activation
    if (sendWelcome) {
      try {
        await sendPushToSubscription(subscription, {
          title: "⚡ EventPilot Alerts Active",
          body: "You will now receive instant lock-screen alerts for new hackathons, conferences & deadlines!",
          url: "/events",
        });
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

    if (!endpoint) {
      return NextResponse.json({ error: "Endpoint is required" }, { status: 400 });
    }

    await removePushSubscription(endpoint);
    return NextResponse.json({ success: true, message: "Subscription removed successfully" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
