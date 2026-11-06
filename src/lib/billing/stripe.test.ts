/**
 * Stripe Checkout parameters, webhook fulfillment (idempotent), signature
 * checks on the raw body, refunds, and the success-page sync. No network: the
 * Stripe client is a fake, and events are built here and signed with a test secret.
 */
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as webhookPOST } from "@/app/api/stripe/webhook/route";
import { getDb } from "@/lib/db/client";
import { applications, purchases, students, users } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { getEntitlements } from "./entitlements";
import { billingConfig, type BillingConfig } from "./plans";
import {
  buildCheckoutParams,
  type CheckoutClient,
  createCheckoutSession,
  defaultWebhookDeps,
  handleStripeEvent,
  purchaseFromSession,
  type RetrieveClient,
  syncCheckoutSession,
  type WebhookDeps,
} from "./stripe";

const config: BillingConfig = { schoolCents: 900, unlimitedCents: 2900, counselorCents: 19900, counselorMaxStudents: 25 };
const SECRET = "whsec_test_billing_module";

/** Stripe ids are letters and digits after the prefix (newId can contain "-" and "_"). */
const stripeId = (prefix: string) => `${prefix}_${newId(12).replace(/[^A-Za-z0-9]/g, "x")}`;

async function account(): Promise<{ userId: string; studentId: string }> {
  const db = await getDb();
  const userId = `stripe-${newId(6)}`;
  await db.insert(users).values({ id: userId, email: `${userId}@example.com`, role: "student" });
  const studentId = `${userId}-s`;
  await db.insert(students).values({ id: studentId, ownerUserId: userId, name: "Sam Rivera", graduationYear: 2027, isSelf: true });
  // The free school is already in use, so credits matter.
  await db.insert(applications).values({ id: `${userId}-app`, studentId, schoolId: "example", unitId: "engineering", promptText: "Why Example University?" });
  return { userId, studentId };
}

function session(overrides: Partial<Stripe.Checkout.Session> & { metadata?: Record<string, string> }): Stripe.Checkout.Session {
  return {
    id: stripeId("cs_test"),
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    amount_total: 2700,
    currency: "usd",
    client_reference_id: null,
    metadata: {},
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

function event(type: string, object: unknown): Stripe.Event {
  return {
    id: stripeId("evt"),
    object: "event",
    type,
    api_version: Stripe.API_VERSION,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  } as unknown as Stripe.Event;
}

async function purchasesOf(userId: string) {
  const db = await getDb();
  return db.select().from(purchases).where(eq(purchases.userId, userId));
}

beforeAll(async () => {
  await getDb();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("checkout session", () => {
  it("is a one-time payment with an inline price and the purchase in its metadata", () => {
    const params = buildCheckoutParams({
      user: { id: "user-1", email: "sam@example.com" },
      request: { kind: "school_credit", quantity: 3, studentId: null },
      origin: "https://whyus.example",
      config: { ...config, schoolCents: 1100 },
    });
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([
      {
        quantity: 3,
        price_data: {
          currency: "usd",
          unit_amount: 1100,
          product_data: { name: "WhyUs school credit", description: "Adds one school to any student's list. Credits never expire." },
        },
      },
    ]);
    expect(params.metadata).toEqual({ userId: "user-1", kind: "school_credit", quantity: "3" });
    expect(params.client_reference_id).toBe("user-1");
    expect(params.success_url).toBe("https://whyus.example/app/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("https://whyus.example/pricing");

    const unlimited = buildCheckoutParams({
      user: { id: "user-1", email: "sam@example.com" },
      request: { kind: "unlimited", quantity: 1, studentId: "student-9" },
      origin: "https://whyus.example",
      config,
    });
    expect(unlimited.metadata).toEqual({ userId: "user-1", kind: "unlimited", quantity: "1", studentId: "student-9" });
    expect(unlimited.line_items?.[0].price_data?.unit_amount).toBe(2900);
    // No student names or profile data go to Stripe.
    expect(JSON.stringify(unlimited)).not.toContain("Sam");
  });

  it("returns the hosted Checkout URL", async () => {
    const create = vi.fn(async () => ({ id: "cs_test_abc", url: "https://checkout.stripe.com/c/pay/cs_test_abc" }));
    const client: CheckoutClient = { checkout: { sessions: { create } } };
    const out = await createCheckoutSession(
      { user: { id: "u", email: "u@example.com" }, request: { kind: "counselor", quantity: 1, studentId: null }, origin: "http://localhost:3000", config },
      client,
    );
    expect(out).toEqual({ id: "cs_test_abc", url: "https://checkout.stripe.com/c/pay/cs_test_abc" });
    expect(create).toHaveBeenCalledOnce();
  });
});

describe("webhook fulfillment", () => {
  it("records a paid checkout once, however often the event is delivered", async () => {
    const { userId } = await account();
    const deps = defaultWebhookDeps(config);
    const paid = session({ client_reference_id: userId, metadata: { userId, kind: "school_credit", quantity: "3" } });
    const completed = event("checkout.session.completed", paid);

    const first = await handleStripeEvent(completed, deps);
    expect(first.action).toBe("recorded");
    const again = await handleStripeEvent(completed, deps);
    expect(again).toEqual({ action: "duplicate", purchaseId: first.action === "recorded" ? first.purchaseId : "" });
    // Stripe can also send async_payment_succeeded for the same session.
    expect((await handleStripeEvent(event("checkout.session.async_payment_succeeded", paid), deps)).action).toBe("duplicate");

    const rows = await purchasesOf(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "school_credit", quantity: 3, amountCents: 2700, currency: "usd", status: "paid", stripeSessionId: paid.id });
    expect((await getEntitlements(userId)).credits).toBe(3);
  });

  it("records delayed payments when they succeed, not before", async () => {
    const { userId, studentId } = await account();
    const deps = defaultWebhookDeps(config);
    const pending = session({ payment_status: "unpaid", amount_total: 2900, metadata: { userId, kind: "unlimited", quantity: "1", studentId } });
    expect(await handleStripeEvent(event("checkout.session.completed", pending), deps)).toEqual({ action: "ignored", reason: "payment status is unpaid" });
    expect(await purchasesOf(userId)).toHaveLength(0);

    const succeeded = await handleStripeEvent(event("checkout.session.async_payment_succeeded", { ...pending, payment_status: "paid" }), deps);
    expect(succeeded.action).toBe("recorded");
    expect((await getEntitlements(userId)).unlimitedStudentIds).toEqual([studentId]);
  });

  it("ignores sessions that are not WhyUs purchases, and accounts that were deleted", async () => {
    const { userId } = await account();
    const deps = defaultWebhookDeps(config);
    expect((await handleStripeEvent(event("checkout.session.completed", session({ metadata: { orderId: "x" } })), deps)).action).toBe("ignored");
    expect((await handleStripeEvent(event("checkout.session.completed", session({ metadata: { userId, kind: "lifetime" } })), deps)).action).toBe("ignored");
    expect((await handleStripeEvent(event("checkout.session.completed", session({ metadata: { userId, kind: "unlimited" } })), deps)).action).toBe("ignored");
    const gone = await handleStripeEvent(event("checkout.session.completed", session({ metadata: { userId: "deleted-user", kind: "school_credit", quantity: "1" } })), deps);
    expect(gone).toEqual({ action: "ignored", reason: "the account no longer exists" });
    expect((await handleStripeEvent(event("customer.created", { id: "cus_1" }), deps)).action).toBe("ignored");
    expect(await purchasesOf(userId)).toHaveLength(0);
  });

  it("marks a fully refunded purchase refunded, and it stops counting", async () => {
    const { userId } = await account();
    const paid = session({ metadata: { userId, kind: "school_credit", quantity: "2" }, amount_total: 1800 });
    const lookups: string[] = [];
    const deps: WebhookDeps = {
      ...defaultWebhookDeps(config),
      sessionIdsForPaymentIntent: async (pi) => {
        lookups.push(pi);
        return pi === "pi_test_1" ? [paid.id] : [];
      },
    };
    await handleStripeEvent(event("checkout.session.completed", paid), deps);
    expect((await getEntitlements(userId)).credits).toBe(2);

    const partial = await handleStripeEvent(event("charge.refunded", { id: "ch_1", object: "charge", refunded: false, payment_intent: "pi_test_1" }), deps);
    expect(partial).toEqual({ action: "ignored", reason: "partial refund" });
    const full = await handleStripeEvent(event("charge.refunded", { id: "ch_1", object: "charge", refunded: true, payment_intent: "pi_test_1" }), deps);
    expect(full).toEqual({ action: "refunded", count: 1 });
    expect(lookups).toEqual(["pi_test_1"]);
    expect((await purchasesOf(userId))[0].status).toBe("refunded");
    expect((await getEntitlements(userId)).credits).toBe(0);
    // A repeated refund event changes nothing more.
    expect(await handleStripeEvent(event("charge.refunded", { id: "ch_1", object: "charge", refunded: true, payment_intent: "pi_test_1" }), deps)).toEqual({
      action: "refunded",
      count: 0,
    });
  });

  it("reads the purchase from session metadata", () => {
    expect(purchaseFromSession(session({ mode: "subscription", metadata: { userId: "u", kind: "school_credit" } }), config)).toMatchObject({ ok: false });
    expect(purchaseFromSession(session({ metadata: { userId: "u", kind: "school_credit", quantity: "50" } }), config)).toMatchObject({ ok: false });
    const fromReference = purchaseFromSession(session({ client_reference_id: "u2", amount_total: null, metadata: { kind: "school_credit", quantity: "2" } }), config);
    expect(fromReference).toMatchObject({ ok: true, purchase: { userId: "u2", quantity: 2, amountCents: 1800 } });
    const counselor = purchaseFromSession(session({ metadata: { userId: "u", kind: "counselor", quantity: "1", studentId: "s" } }), config);
    expect(counselor).toMatchObject({ ok: true, purchase: { kind: "counselor", quantity: 1, studentId: null } });
  });
});

describe("POST /api/stripe/webhook", () => {
  function signed(payload: string, secret = SECRET): Request {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    return new Request("http://localhost:3000/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload });
  }

  it("verifies the signature on the raw body before recording anything", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    const { userId } = await account();
    const payload = JSON.stringify(event("checkout.session.completed", session({ metadata: { userId, kind: "school_credit", quantity: "1" }, amount_total: 900 })));

    const forged = await webhookPOST(signed(payload, "whsec_someone_else"));
    expect(forged.status).toBe(400);
    const tampered = await webhookPOST(
      new Request("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) },
        body: payload.replace('"quantity":"1"', '"quantity":"20"'),
      }),
    );
    expect(tampered.status).toBe(400);
    const unsigned = await webhookPOST(new Request("http://localhost:3000/api/stripe/webhook", { method: "POST", body: payload }));
    expect(unsigned.status).toBe(400);
    expect(await purchasesOf(userId)).toHaveLength(0);

    const ok = await webhookPOST(signed(payload));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ received: true, action: "recorded" });
    const retry = await webhookPOST(signed(payload));
    expect(await retry.json()).toEqual({ received: true, action: "duplicate" });
    expect(await purchasesOf(userId)).toHaveLength(1);
  });

  it("refuses to run without a webhook secret", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const res = await webhookPOST(signed("{}"));
    expect(res.status).toBe(503);
  });
});

describe("success page sync", () => {
  it("records a paid session for its own account, once, alongside the webhook", async () => {
    const { userId } = await account();
    const paid = session({ client_reference_id: userId, metadata: { userId, kind: "school_credit", quantity: "2" }, amount_total: 1800 });
    const client: RetrieveClient = { checkout: { sessions: { retrieve: vi.fn(async (id: string) => ({ ...paid, id })) } } };

    expect(await syncCheckoutSession("someone-else", paid.id, config, client)).toEqual({ status: "not_found" });
    expect(await syncCheckoutSession(userId, "not-a-session", config, client)).toEqual({ status: "not_found" });
    const recorded = await syncCheckoutSession(userId, paid.id, config, client);
    expect(recorded).toMatchObject({ status: "recorded", purchase: { kind: "school_credit", quantity: 2 } });
    await handleStripeEvent(event("checkout.session.completed", paid), defaultWebhookDeps(config));
    expect(await purchasesOf(userId)).toHaveLength(1);
  });

  it("waits for payment, and treats Stripe errors as not found", async () => {
    const { userId } = await account();
    const unpaid = session({ payment_status: "unpaid", metadata: { userId, kind: "school_credit", quantity: "1" } });
    const pending: RetrieveClient = { checkout: { sessions: { retrieve: async () => unpaid } } };
    expect(await syncCheckoutSession(userId, unpaid.id, config, pending)).toEqual({ status: "pending" });
    const failing: RetrieveClient = {
      checkout: {
        sessions: {
          retrieve: async () => {
            throw new Error("No such checkout.session");
          },
        },
      },
    };
    expect(await syncCheckoutSession(userId, unpaid.id, config, failing)).toEqual({ status: "not_found" });
    expect(await purchasesOf(userId)).toHaveLength(0);
  });

  it("uses the configured prices", () => {
    vi.stubEnv("PRICE_SCHOOL_CENTS", "1500");
    expect(billingConfig().schoolCents).toBe(1500);
  });
});
