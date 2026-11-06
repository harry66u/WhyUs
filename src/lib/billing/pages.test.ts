/**
 * Server-renders the pricing, privacy, and settings pages to catch runtime
 * errors and check the copy that matters: prices from the environment, the
 * privacy promises, and the plan state for each kind of account.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/auth/session";

const h = vi.hoisted(() => ({ user: null as User | null }));

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => {
    if (!h.user) throw new Error("NEXT_REDIRECT:/login");
    return h.user;
  }),
  getCurrentUser: vi.fn(async () => h.user),
  getUserOr401: vi.fn(async () => h.user ?? Response.json({ error: "Sign in required" }, { status: 401 })),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  usePathname: () => "/app/settings",
}));

import PricingPage, { generateMetadata as pricingMetadata } from "@/app/(marketing)/pricing/page";
import PrivacyPage from "@/app/(marketing)/privacy/page";
import SettingsPage from "@/app/app/settings/page";
import { getDb } from "@/lib/db/client";
import { applications, purchases, students, users } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import type { AccountRole } from "@/lib/types";

const EMOJI = /\p{Extended_Pictographic}/u;

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

async function renderSettings(searchParams: Record<string, string> = {}): Promise<string> {
  const element = (await SettingsPage({ searchParams: Promise.resolve(searchParams) })) as ReactElement;
  return renderToStaticMarkup(element);
}

async function signIn(role: AccountRole, opts: { students?: number; schools?: number } = {}) {
  const db = await getDb();
  const id = `pg-${newId(6)}`;
  const now = new Date();
  h.user = { id, email: `${id}@example.com`, name: "Pat Example", role, createdAt: now, updatedAt: now };
  await db.insert(users).values({ id, email: h.user.email, name: h.user.name, role });
  const ids: string[] = [];
  for (let i = 0; i < (opts.students ?? 1); i++) {
    const sid = `${id}-s${i}`;
    ids.push(sid);
    await db.insert(students).values({ id: sid, ownerUserId: id, name: `Student ${i + 1}`, graduationYear: 2027, isSelf: role === "student" });
  }
  for (let i = 0; i < (opts.schools ?? 0); i++) {
    await db.insert(applications).values({ id: `${id}-a${i}`, studentId: ids[0], schoolId: "example", unitId: `u${i}`, promptText: "Why Example University?" });
  }
  return { userId: id, studentIds: ids };
}

beforeEach(() => {
  h.user = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pricing page", () => {
  it("shows the four options with prices from the environment", async () => {
    vi.stubEnv("PRICE_SCHOOL_CENTS", "1000");
    const html = renderToStaticMarkup(createElement(PricingPage));
    const t = text(html);
    expect(t).toContain("Your first school is free");
    for (const s of ["First school", "School credit", "Unlimited", "Counselor plan", "$10", "$29", "$199", "Up to 25 students", "12 months"]) expect(t).toContain(s);
    expect(t).toContain("From 3 schools it costs less than credits.");
    expect(t).toContain("Every dossier includes");
    expect(t).toContain("Does WhyUs write any part of the essay?");
    expect(html).toContain("<table");
    expect(html).not.toContain("<main");
    expect(html).not.toMatch(EMOJI);
    expect((await pricingMetadata()).description).toContain("$10 per school");
  });

  it("shows the support address for refunds only when one is configured", () => {
    expect(text(renderToStaticMarkup(createElement(PricingPage)))).toContain("Contact us within 14 days");
    vi.stubEnv("SUPPORT_EMAIL", "help@whyus.example");
    expect(renderToStaticMarkup(createElement(PricingPage))).toContain('href="mailto:help@whyus.example"');
  });
});

describe("privacy page", () => {
  it("states the promises in plain language", () => {
    const html = renderToStaticMarkup(createElement(PrivacyPage));
    const t = text(html);
    expect(t).toContain("never used to train any model");
    expect(t).toContain("do not allow Anthropic to use customer data sent through the API to train its models");
    expect(t).toContain("Deletion is immediate and complete");
    expect(t).toContain("contains no student data");
    expect(t).toContain("Session cookie");
    expect(t).toContain("Share links are off until you create one");
    expect(html).not.toContain("<main");
    expect(html).not.toMatch(EMOJI);
  });
});

describe("settings page", () => {
  it("shows a student's account, plan, purchases, appearance, and data controls", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { userId } = await signIn("student", { schools: 1 });
    const db = await getDb();
    await db.insert(purchases).values({ id: `${userId}-p`, userId, kind: "school_credit", quantity: 2, amountCents: 1800, status: "simulated" });
    const html = await renderSettings();
    const t = text(html);
    for (const s of ["Account", "Plan", "Purchases", "Appearance", "Privacy and data"]) expect(html).toContain(`>${s}</h2>`);
    expect(t).toContain(h.user!.email);
    expect(t).toContain("Student");
    expect(t).toContain("2 left of 2");
    expect(t).toContain("Development: simulate purchase");
    expect(t).toContain("2 school credits");
    expect(t).toContain("Simulated");
    expect(t).toContain("Download my data");
    expect(html).toContain('href="/api/account/export"');
    expect(t).toContain("Delete account");
    expect(t).not.toContain("Counselor plan");
    expect(html).not.toMatch(EMOJI);
  });

  it("lists students and the counselor plan for counselor accounts", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    await signIn("counselor", { students: 2 });
    const t = text(await renderSettings());
    expect(t).toContain("Counselor plan");
    expect(t).toContain("2 of 3 on this account");
    expect(t).toContain("Student 1");
    expect(t).toContain("Delete one student's data");
    expect(t).toContain("Checkout opens on Stripe");
    expect(t).not.toContain("Development: simulate purchase");
    expect(t).toContain("Your first school is free. Add it before you buy credits.");
  });

  it("says payments are unavailable in production without Stripe", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    await signIn("parent");
    const t = text(await renderSettings());
    expect(t).toContain("Payments are not available on this site right now.");
    expect(t).not.toContain("Development: simulate purchase");
  });

  it("explains a checkout return and a failed typed confirmation", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    await signIn("student");
    const t = text(await renderSettings({ checkout: "success", delete: "mismatch" }));
    expect(t).toContain("Payment received. It can take a minute to show up here");
    expect(t).toContain("The email address you typed did not match. Nothing was deleted.");
  });
});
