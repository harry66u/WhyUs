/**
 * POST /api/billing/simulate   body: { kind, quantity?, studentId? }
 *
 * Development only, and only while Stripe keys are not set: records the purchase
 * with status "simulated" without charging anyone, so every plan can be tried
 * locally. Answers 404 in production and whenever Stripe is configured.
 */
import { getUserOr401 } from "@/lib/auth/session";
import { getBillingState } from "@/lib/billing/entitlements";
import { allowRequest, json, jsonError, readJsonBody, rejectCrossSite } from "@/lib/billing/http";
import { CURRENCY, purchaseTitle, unitPriceCents } from "@/lib/billing/plans";
import { recordPurchase } from "@/lib/billing/purchases";
import { checkPurchase, parsePurchaseRequest } from "@/lib/billing/rules";
import { simulationAvailable } from "@/lib/billing/stripe";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!simulationAvailable()) return jsonError("Not found.", 404);
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  const user = await getUserOr401();
  if (user instanceof Response) return user;
  if (!allowRequest(`simulate:${user.id}`, 60, 10 * 60 * 1000)) {
    return jsonError("Too many simulated purchases in a few minutes. Wait a moment and try again.", 429);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return jsonError(body.error, 400);
  const parsed = parsePurchaseRequest(body.value);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const { input, state } = await getBillingState(user.id);
  const allowed = checkPurchase(state, input, parsed.value);
  if (!allowed.ok) return jsonError(allowed.error, allowed.status);

  const { kind, quantity, studentId } = parsed.value;
  const { purchase } = await recordPurchase({
    userId: user.id,
    kind,
    quantity,
    studentId,
    amountCents: unitPriceCents(kind, input.config) * quantity,
    currency: CURRENCY,
    stripeSessionId: null,
    status: "simulated",
  });
  return json(
    {
      purchase: { id: purchase.id, kind: purchase.kind, quantity: purchase.quantity, studentId: purchase.studentId, status: purchase.status },
      message: `Simulated purchase recorded: ${purchaseTitle(purchase.kind, purchase.quantity).toLowerCase()}.`,
    },
    201,
  );
}
