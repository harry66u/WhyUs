/**
 * POST /api/stripe/webhook
 *
 * Stripe calls this with signed events. The signature (STRIPE_WEBHOOK_SECRET) is
 * checked against the raw body before anything is read from it. Subscribe the
 * endpoint to: checkout.session.completed, checkout.session.async_payment_succeeded,
 * and charge.refunded. Delivering the same event twice records one purchase.
 */
import type Stripe from "stripe";
import { json, jsonError } from "@/lib/billing/http";
import { billingConfig } from "@/lib/billing/plans";
import { defaultWebhookDeps, handleStripeEvent, verifyWebhookEvent } from "@/lib/billing/stripe";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[billing] Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set");
    return jsonError("Webhooks are not configured.", 503);
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return jsonError("Missing Stripe-Signature header.", 400);

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = verifyWebhookEvent(raw, signature, secret);
  } catch {
    return jsonError("The Stripe signature does not match this payload.", 400);
  }

  try {
    const result = await handleStripeEvent(event, defaultWebhookDeps(billingConfig()));
    if (result.action === "ignored") console.info(`[billing] ${event.type} ${event.id} ignored: ${result.reason}`);
    return json({ received: true, action: result.action });
  } catch (err) {
    // A 5xx makes Stripe retry later; recording is idempotent, so retries are safe.
    console.error(`[billing] could not process ${event.type} ${event.id}`, err);
    return jsonError("The event could not be processed.", 500);
  }
}
