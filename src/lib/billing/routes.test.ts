/**
 * Billing and account API routes against the in-memory database: checkout,
 * simulated checkout (development only), data export, and account deletion.
 * The session and the Stripe API are mocked. Fictional accounts only.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/auth/session";

const h = vi.hoisted(() => ({ user: null as User | null, deletedCookies: [] as string[] }));

vi.mock("@/lib/auth/session", () => ({
  getUserOr401: vi.fn(async () => h.user ?? Response.json({ error: "Sign in required" }, { status: 401 })),
  getCurrentUser: vi.fn(async () => h.user),
  requireUser: vi.fn(async () => {
    if (!h.user) throw new Error("NEXT_REDIRECT:/login");
    return h.user;
  }),
  destroySession: vi.fn(async () => undefined),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, delete: (name: string) => void h.deletedCookies.push(name) }),
}));
vi.mock("@/lib/billing/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/stripe")>()),
  createCheckoutSession: vi.fn(async () => ({ id: "cs_test_fake", url: "https://checkout.stripe.com/c/pay/cs_test_fake" })),
}));

import { POST as deletePOST } from "@/app/api/account/delete/route";
import { GET as exportGET } from "@/app/api/account/export/route";
import { POST as simulatePOST } from "@/app/api/billing/simulate/route";
import { POST as checkoutPOST } from "@/app/api/stripe/checkout/route";
import { destroySession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { applications, dossiers, loginTokens, purchases, researchRuns, sessions, shareLinks, students, users } from "@/lib/db/schema";
import { EXAMPLE_DOSSIER } from "@/lib/fixtures/example-dossier";
import { newId } from "@/lib/ids";
import type { AccountRole } from "@/lib/types";
import type { AccountExport } from "./account-data";
import { getEntitlements } from "./entitlements";
import { createCheckoutSession } from "./stripe";

async function newAccount(role: AccountRole, opts: { withSchool?: boolean } = {}) {
  const db = await getDb();
  const id = `rt-${newId(6)}`;
  const now = new Date();
  const user: User = { id, email: `${id}@example.com`, name: "Pat Example", role, createdAt: now, updatedAt: now };
  await db.insert(users).values({ id, email: user.email, name: user.name, role });
  const studentId = `${id}-s`;
  await db.insert(students).values({
    id: studentId,
    ownerUserId: id,
    name: "Sam Rivera",
    graduationYear: 2027,
    isSelf: role === "student",
    intendedMajors: ["Environmental engineering"],
    activities: [{ id: "act-1", title: "Creek sensor project", description: "Built water quality sensors for a local creek." }],
  });
  let applicationId: string | null = null;
  if (opts.withSchool) {
    applicationId = `${id}-app`;
    await db.insert(applications).values({ id: applicationId, studentId, schoolId: "example", unitId: "engineering", promptText: "Why Example University?", wordLimit: 250 });
  }
  return { user, studentId, applicationId };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  h.user = null;
  h.deletedCookies = [];
  vi.mocked(createCheckoutSession).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/stripe/checkout", () => {
  it("needs Stripe keys; without them it points development to the simulated purchase", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { user } = await newAccount("student", { withSchool: true });
    h.user = user;
    const res = await checkoutPOST(post("/api/stripe/checkout", { kind: "school_credit" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("simulated purchase");
  });

  it("creates a Checkout Session for a valid purchase and answers with its URL", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    vi.stubEnv("APP_URL", "https://whyus.example");
    const { user } = await newAccount("student", { withSchool: true });
    h.user = user;
    const res = await checkoutPOST(post("/api/stripe/checkout", { kind: "school_credit", quantity: 2 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_fake" });
    expect(vi.mocked(createCheckoutSession)).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: user.id, email: user.email },
        request: { kind: "school_credit", quantity: 2, studentId: null },
        origin: "https://whyus.example",
      }),
    );
  });

  it("refuses purchases that would do nothing, bad bodies, other origins, and signed-out requests", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    const fresh = await newAccount("student");
    h.user = fresh.user;
    const credit = await checkoutPOST(post("/api/stripe/checkout", { kind: "school_credit" }));
    expect(credit.status).toBe(409);
    expect((await credit.json()).error).toBe("Your first school is free. Add it before you buy credits.");
    expect((await checkoutPOST(post("/api/stripe/checkout", { kind: "counselor" }))).status).toBe(403);
    expect((await checkoutPOST(post("/api/stripe/checkout", { kind: "unlimited", studentId: "not-mine" }))).status).toBe(404);
    expect((await checkoutPOST(post("/api/stripe/checkout", { kind: "everything" }))).status).toBe(400);
    expect((await checkoutPOST(post("/api/stripe/checkout", "{not json"))).status).toBe(400);
    expect((await checkoutPOST(post("/api/stripe/checkout", { kind: "unlimited", studentId: fresh.studentId }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect(
      (await checkoutPOST(post("/api/stripe/checkout", { kind: "unlimited", studentId: fresh.studentId }, { origin: "https://evil.example" }))).status,
    ).toBe(403);
    h.user = null;
    expect((await checkoutPOST(post("/api/stripe/checkout", { kind: "unlimited", studentId: fresh.studentId }))).status).toBe(401);
    expect(vi.mocked(createCheckoutSession)).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/simulate", () => {
  it("grants the purchase as simulated in development without Stripe keys", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { user, studentId } = await newAccount("parent", { withSchool: true });
    h.user = user;
    const credits = await simulatePOST(post("/api/billing/simulate", { kind: "school_credit", quantity: 3 }));
    expect(credits.status).toBe(201);
    expect((await credits.json()).purchase).toMatchObject({ kind: "school_credit", quantity: 3, status: "simulated" });
    const unlimited = await simulatePOST(post("/api/billing/simulate", { kind: "unlimited", studentId }));
    expect(unlimited.status).toBe(201);

    const db = await getDb();
    const rows = await db.select().from(purchases).where(eq(purchases.userId, user.id));
    expect(rows.map((r) => [r.kind, r.status, r.amountCents, r.stripeSessionId])).toEqual(
      expect.arrayContaining([
        ["school_credit", "simulated", 2700, null],
        ["unlimited", "simulated", 2900, null],
      ]),
    );
    const ent = await getEntitlements(user.id);
    expect(ent.credits).toBe(3);
    expect(ent.unlimitedStudentIds).toEqual([studentId]);
    expect((await simulatePOST(post("/api/billing/simulate", { kind: "unlimited", studentId }))).status).toBe(409);
  });

  it("does not exist in production or when Stripe is configured", async () => {
    const { user } = await newAccount("student", { withSchool: true });
    h.user = user;
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect((await simulatePOST(post("/api/billing/simulate", { kind: "school_credit" }))).status).toBe(404);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    expect((await simulatePOST(post("/api/billing/simulate", { kind: "school_credit" }))).status).toBe(404);
    const db = await getDb();
    expect(await db.select().from(purchases).where(eq(purchases.userId, user.id))).toHaveLength(0);
  });
});

describe("GET /api/account/export", () => {
  it("downloads this account's data and nothing from other accounts", async () => {
    vi.stubEnv("APP_URL", "https://whyus.example");
    const mine = await newAccount("student", { withSchool: true });
    const theirs = await newAccount("student", { withSchool: true });
    const db = await getDb();
    const dossierId = `${mine.user.id}-dossier`;
    await db.insert(dossiers).values({
      id: dossierId,
      applicationId: mine.applicationId!,
      studentId: mine.studentId,
      schoolId: "example",
      uniquenessScore: 74,
      payload: { ...EXAMPLE_DOSSIER, id: dossierId, applicationId: mine.applicationId!, studentId: mine.studentId },
    });
    await db.insert(shareLinks).values({ token: `tok-${newId(8)}`, dossierId, createdByUserId: mine.user.id });
    await db.insert(researchRuns).values({ id: `${mine.user.id}-run`, applicationId: mine.applicationId!, status: "done" });
    await db.insert(purchases).values({ id: `${mine.user.id}-p`, userId: mine.user.id, kind: "school_credit", quantity: 1, amountCents: 900, stripeSessionId: `cs_test_${newId(8)}` });

    h.user = null;
    expect((await exportGET(new Request("http://localhost:3000/api/account/export"))).status).toBe(401);

    h.user = mine.user;
    const res = await exportGET(new Request("http://localhost:3000/api/account/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="whyus-data-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const data = (await res.json()) as AccountExport;
    expect(data.format).toBe("whyus-account-export");
    expect(data.account).toMatchObject({ email: mine.user.email, accountType: "student" });
    expect(data.students.map((s) => s.id)).toEqual([mine.studentId]);
    expect(data.students[0].activities[0].title).toBe("Creek sensor project");
    expect(data.applications.map((a) => a.id)).toEqual([mine.applicationId]);
    expect(data.dossiers).toHaveLength(1);
    expect(data.dossiers[0].dossier.details.length).toBeGreaterThan(0);
    expect(data.researchRuns).toHaveLength(1);
    expect(data.shareLinks[0].url).toMatch(/^https:\/\/whyus\.example\/d\/tok-/);
    expect(data.purchases).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain(theirs.user.id);
  });
});

describe("POST /api/account/delete", () => {
  it("requires the account's email address typed exactly", async () => {
    const { user } = await newAccount("student", { withSchool: true });
    h.user = user;
    const wrong = await deletePOST(post("/api/account/delete", { confirm: "someone@example.com" }));
    expect(wrong.status).toBe(400);
    expect((await deletePOST(post("/api/account/delete", {}))).status).toBe(400);
    expect((await deletePOST(post("/api/account/delete", { confirm: user.email }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    const db = await getDb();
    expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(1);
    h.user = null;
    expect((await deletePOST(post("/api/account/delete", { confirm: user.email }))).status).toBe(401);
  });

  it("deletes the account and everything it owns, ends the session, and sends the browser home", async () => {
    const { user, studentId, applicationId } = await newAccount("counselor", { withSchool: true });
    const other = await newAccount("student", { withSchool: true });
    const db = await getDb();
    const dossierId = `${user.id}-dossier`;
    await db.insert(dossiers).values({
      id: dossierId,
      applicationId: applicationId!,
      studentId,
      schoolId: "example",
      uniquenessScore: 60,
      payload: { ...EXAMPLE_DOSSIER, id: dossierId, applicationId: applicationId!, studentId },
    });
    const token = `tok-${newId(8)}`;
    await db.insert(shareLinks).values({ token, dossierId, createdByUserId: user.id });
    await db.insert(researchRuns).values({ id: `${user.id}-run`, applicationId: applicationId!, status: "done" });
    await db.insert(purchases).values({ id: `${user.id}-p`, userId: user.id, kind: "counselor", amountCents: 19900, stripeSessionId: `cs_test_${newId(8)}` });
    await db.insert(sessions).values({ id: `sess-${newId(8)}`, userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) });
    await db.insert(loginTokens).values({ id: newId(), email: user.email, tokenHash: `hash-${newId(8)}`, expiresAt: new Date(Date.now() + 60_000) });

    h.user = user;
    const res = await deletePOST(post("/api/account/delete", { confirm: `  ${user.email.toUpperCase()} ` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, redirectTo: "/?deleted=1" });
    expect(vi.mocked(destroySession)).toHaveBeenCalled();
    expect(h.deletedCookies).toContain("whyus_student");

    expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(0);
    expect(await db.select().from(students).where(eq(students.ownerUserId, user.id))).toHaveLength(0);
    expect(await db.select().from(applications).where(eq(applications.studentId, studentId))).toHaveLength(0);
    expect(await db.select().from(dossiers).where(eq(dossiers.id, dossierId))).toHaveLength(0);
    expect(await db.select().from(shareLinks).where(eq(shareLinks.token, token))).toHaveLength(0);
    expect(await db.select().from(researchRuns).where(eq(researchRuns.applicationId, applicationId!))).toHaveLength(0);
    expect(await db.select().from(purchases).where(eq(purchases.userId, user.id))).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    expect(await db.select().from(loginTokens).where(eq(loginTokens.email, user.email))).toHaveLength(0);
    // Other accounts are untouched.
    expect(await db.select().from(students).where(eq(students.id, other.studentId))).toHaveLength(1);
  });

  it("accepts a plain form post and answers with a redirect", async () => {
    const { user } = await newAccount("student");
    h.user = user;
    const form = (confirm: string) =>
      new Request("http://localhost:3000/api/account/delete", {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ confirm }).toString(),
      });
    const mismatch = await deletePOST(form("nope"));
    expect(mismatch.status).toBe(303);
    expect(mismatch.headers.get("location")).toBe("http://localhost:3000/app/settings?delete=mismatch#delete-account");
    const done = await deletePOST(form(user.email));
    expect(done.status).toBe(303);
    expect(done.headers.get("location")).toBe("http://localhost:3000/?deleted=1");
    const db = await getDb();
    expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(0);
  });
});
