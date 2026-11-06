/**
 * POST /api/stripe/checkout   body: { kind: "school_credit" | "unlimited" | "counselor", quantity?, studentId? }
 *
 * Starts a Stripe Checkout Session (one-time payment, inline price) for the
 * signed-in account and answers { url }. The purchase is recorded when Stripe
 * confirms payment (webhook), never here.
 */
import { getUserOr401 } from "@/lib/auth/session";
import { getBillingState } from "@/lib/billing/entitlements";
import { allowRequest, appOrigin, json, jsonError, readJsonBody, rejectCrossSite } from "@/lib/billing/http";
import { checkPurchase, parsePurchaseRequest } from "@/lib/billing/rules";
import { createCheckoutSession, simulationAvailable, stripeConfigured } from "@/lib/billing/stripe";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  const user = await getUserOr401();
  if (user instanceof Response) return user;

  if (!stripeConfigured()) {
    return jsonError(
      simulationAvailable()
        ? "Stripe is not configured. In development, use the simulated purchase in Settings."
        : "Payments are not available right now. Try again later.",
      503,
    );
  }
  if (!allowRequest(`checkout:${user.id}`, 20, 10 * 60 * 1000)) {
    return jsonError("Too many checkout attempts in a few minutes. Wait a moment and try again.", 429);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return jsonError(body.error, 400);
  const parsed = parsePurchaseRequest(body.value);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const { input, state } = await getBillingState(user.id);
  const allowed = checkPurchase(state, input, parsed.value);
  if (!allowed.ok) return jsonError(allowed.error, allowed.status);

  try {
    const session = await createCheckoutSession({
      user: { id: user.id, email: user.email },
      request: parsed.value,
      origin: appOrigin(request.url),
      config: input.config,
    });
    return json({ url: session.url });
  } catch (err) {
    console.error("[billing] could not create a Checkout Session", err);
    return jsonError("Checkout could not be started. Try again in a moment.", 502);
  }
}
