import { describe, expect, it } from "vitest";
import type { BillingConfig } from "./plans";
import { billingConfig, countingRules, formatMoney, PLAN_TERM_DAYS, unlimitedBreakEven } from "./plans";
import {
  type BillingApplication,
  type BillingInput,
  type BillingPurchase,
  checkAddSchool,
  checkAddStudent,
  checkPurchase,
  computeBilling,
  parsePurchaseRequest,
  type PurchaseRequest,
} from "./rules";

const config: BillingConfig = { schoolCents: 900, unlimitedCents: 2900, counselorCents: 19900, counselorMaxStudents: 25 };
const NOW = new Date("2026-11-06T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

/** A moment `minutes` before NOW, so ordering is explicit in each test. */
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

function app(id: string, studentId: string, minutesAgo: number): BillingApplication {
  return { id, studentId, createdAt: ago(minutesAgo) };
}

let n = 0;
function buy(
  kind: BillingPurchase["kind"],
  minutesAgo: number,
  opts: { quantity?: number; studentId?: string; status?: BillingPurchase["status"] } = {},
): BillingPurchase {
  return {
    id: `p${++n}`,
    kind,
    quantity: opts.quantity ?? 1,
    studentId: opts.studentId ?? null,
    status: opts.status ?? "paid",
    createdAt: ago(minutesAgo),
  };
}

function setup(partial: Partial<BillingInput> = {}) {
  const input: BillingInput = {
    role: "student",
    students: [{ id: "s1", name: "Sam Rivera" }],
    applications: [],
    purchases: [],
    now: NOW,
    config,
    countSimulated: true,
    ...partial,
  };
  const state = computeBilling(input);
  return {
    input,
    state,
    ent: state.entitlements,
    add: (studentId = "s1") => checkAddSchool(state, input, studentId),
    addStudent: () => checkAddStudent(state, input),
    purchase: (req: PurchaseRequest) => checkPurchase(state, input, req),
  };
}

const CREDIT: PurchaseRequest = { kind: "school_credit", quantity: 1, studentId: null };

describe("free school", () => {
  it("is available to a new account and used by its first school", () => {
    const fresh = setup();
    expect(fresh.ent).toEqual({
      remainingSchools: 1,
      freeSchoolAvailable: true,
      credits: 0,
      unlimitedStudentIds: [],
      counselorPlan: { active: false, maxStudents: 25 },
    });
    expect(fresh.add()).toEqual({ ok: true, uses: "free" });

    const used = setup({ applications: [app("a1", "s1", 10)] });
    expect(used.ent.freeSchoolAvailable).toBe(false);
    expect(used.ent.remainingSchools).toBe(0);
    expect(used.state.freeSchool.applicationId).toBe("a1");
    const blocked = used.add();
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toContain("You have used your free school.");
      expect(blocked.reason).toContain("$9");
      expect(blocked.reason).toContain("$29");
    }
  });

  it("is one per account, not per student", () => {
    const parent = setup({
      role: "parent",
      students: [{ id: "s1" }, { id: "s2" }],
      applications: [app("a1", "s1", 10)],
    });
    expect(parent.add("s2").ok).toBe(false);
  });

  it("comes back if the only school is removed before any credit purchase", () => {
    // Documented limit: without a stored history, an account with no purchases and no schools looks new.
    const removed = setup({ applications: [] });
    expect(removed.ent.freeSchoolAvailable).toBe(true);
  });

  it("is not used up by buying unlimited or the counselor plan", () => {
    const parent = setup({
      role: "parent",
      students: [{ id: "s1" }, { id: "s2" }],
      applications: [app("a1", "s1", 5)],
      purchases: [buy("unlimited", 10, { studentId: "s1" })],
    });
    expect(parent.ent.freeSchoolAvailable).toBe(true);
    expect(parent.add("s2")).toEqual({ ok: true, uses: "free" });
  });
});

describe("school credits", () => {
  it("each credit adds one school after the free one", () => {
    const apps = [app("free", "s1", 100)];
    const bought = setup({ applications: apps, purchases: [buy("school_credit", 90, { quantity: 3 })] });
    expect(bought.ent.credits).toBe(3);
    expect(bought.ent.remainingSchools).toBe(3);
    expect(bought.add()).toEqual({ ok: true, uses: "credit" });

    const full = setup({
      applications: [...apps, app("c1", "s1", 80), app("c2", "s1", 70), app("c3", "s1", 60)],
      purchases: [buy("school_credit", 90, { quantity: 3 })],
    });
    expect(full.state.credits).toEqual({ purchased: 3, used: 3, left: 0 });
    expect(full.ent.remainingSchools).toBe(0);
    const blocked = full.add();
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toContain("free school and all of your school credits");
  });

  it("removing the free school after buying credits does not bring it back", () => {
    // The free school (added before the purchase) was removed; three credit schools remain.
    const s = setup({
      applications: [app("c1", "s1", 80), app("c2", "s1", 70), app("c3", "s1", 60)],
      purchases: [buy("school_credit", 90, { quantity: 3 })],
    });
    expect(s.ent.freeSchoolAvailable).toBe(false);
    expect(s.state.freeSchool.applicationId).toBeNull();
    expect(s.ent.remainingSchools).toBe(0);
    expect(s.add().ok).toBe(false);
  });

  it("removing a school that used a credit returns the credit", () => {
    const s = setup({
      applications: [app("free", "s1", 100), app("c1", "s1", 80)],
      purchases: [buy("school_credit", 90, { quantity: 2 })],
    });
    expect(s.state.freeSchool.applicationId).toBe("free");
    expect(s.state.credits).toEqual({ purchased: 2, used: 1, left: 1 });
  });

  it("cannot be bought while the free school is unused", () => {
    const fresh = setup();
    expect(fresh.purchase(CREDIT)).toEqual({ ok: false, status: 409, error: "Your first school is free. Add it before you buy credits." });
    const used = setup({ applications: [app("a1", "s1", 10)] });
    expect(used.purchase(CREDIT)).toEqual({ ok: true });
  });

  it("are shared by every student on the account", () => {
    const parent = setup({
      role: "parent",
      students: [{ id: "s1" }, { id: "s2" }],
      applications: [app("free", "s1", 100), app("c1", "s2", 50)],
      purchases: [buy("school_credit", 90, { quantity: 2 })],
    });
    expect(parent.ent.credits).toBe(1);
    expect(parent.add("s1")).toEqual({ ok: true, uses: "credit" });
    expect(parent.add("s2")).toEqual({ ok: true, uses: "credit" });
  });
});

describe("unlimited", () => {
  it("covers every school for one student without using credits", () => {
    const parent = setup({
      role: "parent",
      students: [{ id: "s1" }, { id: "s2" }],
      applications: [app("free", "s2", 200), app("u1", "s1", 100), app("u2", "s1", 90), app("u3", "s1", 80)],
      purchases: [buy("school_credit", 150, { quantity: 1 }), buy("unlimited", 120, { studentId: "s1" })],
    });
    expect(parent.ent.unlimitedStudentIds).toEqual(["s1"]);
    expect(parent.add("s1")).toEqual({ ok: true, uses: "unlimited" });
    expect(parent.state.coveredApplicationIds).toEqual(["u1", "u2", "u3"]);
    // s2 still has the credit: s1's schools never used it.
    expect(parent.state.credits).toEqual({ purchased: 1, used: 0, left: 1 });
    expect(parent.add("s2")).toEqual({ ok: true, uses: "credit" });
    expect(parent.ent.remainingSchools).toBe(1);
  });

  it("makes remainingSchools infinite when it covers every student", () => {
    const student = setup({ applications: [app("a1", "s1", 10)], purchases: [buy("unlimited", 5, { studentId: "s1" })] });
    expect(student.ent.remainingSchools).toBe(Number.POSITIVE_INFINITY);
    expect(student.add()).toEqual({ ok: true, uses: "unlimited" });
    expect(student.purchase(CREDIT)).toMatchObject({ ok: false, status: 409 });
    expect(student.purchase({ kind: "unlimited", quantity: 1, studentId: "s1" })).toMatchObject({ ok: false, status: 409 });
  });

  it("lasts one application season (12 months) from purchase", () => {
    const boughtAt = PLAN_TERM_DAYS * DAY / 60_000 + 60; // a little over 12 months ago, in minutes
    const ended = setup({
      applications: [app("a1", "s1", boughtAt - 10), app("a2", "s1", boughtAt - 20)],
      purchases: [buy("unlimited", boughtAt, { studentId: "s1" })],
    });
    expect(ended.ent.unlimitedStudentIds).toEqual([]);
    expect(ended.state.endedUnlimited.map((u) => u.studentId)).toEqual(["s1"]);
    const blocked = ended.add();
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toMatch(/^Unlimited schools for this student ended on \w{3} \d{1,2}, \d{4}\./);

    const stillOn = setup({ purchases: [buy("unlimited", boughtAt - 120, { studentId: "s1" })] });
    expect(stillOn.ent.unlimitedStudentIds).toEqual(["s1"]);
  });

  it("ignores plans for students that are no longer on the account", () => {
    const s = setup({ purchases: [buy("unlimited", 10, { studentId: "deleted-student" })] });
    expect(s.ent.unlimitedStudentIds).toEqual([]);
  });
});

describe("counselor plan", () => {
  const roster = Array.from({ length: 4 }, (_, i) => ({ id: `s${i + 1}` }));

  it("covers every school for every student on the account", () => {
    const c = setup({
      role: "counselor",
      students: roster,
      applications: roster.flatMap((s, i) => [app(`${s.id}-a`, s.id, 50 - i), app(`${s.id}-b`, s.id, 40 - i)]),
      purchases: [buy("counselor", 60)],
    });
    expect(c.ent.counselorPlan).toEqual({ active: true, maxStudents: 25 });
    expect(c.ent.remainingSchools).toBe(Number.POSITIVE_INFINITY);
    for (const s of roster) expect(c.add(s.id)).toEqual({ ok: true, uses: "counselor" });
    expect(c.state.coveredApplicationIds).toHaveLength(8);
    expect(c.purchase(CREDIT)).toMatchObject({ ok: false, status: 409 });
    expect(c.purchase({ kind: "unlimited", quantity: 1, studentId: "s1" })).toMatchObject({ ok: false, status: 409 });
  });

  it("allows 3 students without the plan and 25 per plan with it", () => {
    const three = Array.from({ length: 3 }, (_, i) => ({ id: `s${i}` }));
    const without = setup({ role: "counselor", students: three });
    expect(without.addStudent()).toMatchObject({ ok: false });
    const withPlan = setup({ role: "counselor", students: three, purchases: [buy("counselor", 10)] });
    expect(withPlan.addStudent()).toEqual({ ok: true });

    const full = Array.from({ length: 25 }, (_, i) => ({ id: `s${i}` }));
    const atCap = setup({ role: "counselor", students: full, purchases: [buy("counselor", 10)] });
    const blocked = atCap.addStudent();
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toContain("up to 25 students");
    const twoPlans = setup({ role: "counselor", students: full, purchases: [buy("counselor", 10), buy("counselor", 5)] });
    expect(twoPlans.ent.counselorPlan.maxStudents).toBe(50);
    expect(twoPlans.addStudent()).toEqual({ ok: true });
  });

  it("is only sold to counselor accounts", () => {
    expect(setup({ role: "parent", students: [] }).purchase({ kind: "counselor", quantity: 1, studentId: null })).toEqual({
      ok: false,
      status: 403,
      error: "The counselor plan is for counselor accounts.",
    });
    expect(setup({ role: "counselor", students: [] }).purchase({ kind: "counselor", quantity: 1, studentId: null })).toEqual({ ok: true });
  });

  it("stops covering schools when it ends, and says so", () => {
    const old = PLAN_TERM_DAYS * DAY / 60_000 + 30;
    const c = setup({
      role: "counselor",
      students: [{ id: "s1" }],
      applications: [app("a1", "s1", old - 10)],
      purchases: [buy("counselor", old)],
    });
    expect(c.ent.counselorPlan.active).toBe(false);
    const blocked = c.add("s1");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toMatch(/^Your counselor plan ended on /);
  });
});

describe("students", () => {
  it("gives a student account its own profile only", () => {
    expect(setup({ students: [] }).addStudent()).toEqual({ ok: true });
    const r = setup().addStudent();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("one profile, its own");
  });

  it("lets a parent manage up to 5 students", () => {
    const four = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}` }));
    expect(setup({ role: "parent", students: four }).addStudent()).toEqual({ ok: true });
    const r = setup({ role: "parent", students: [...four, { id: "s4" }] }).addStudent();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("up to 5 students");
  });

  it("refuses schools for a student that is not on the account", () => {
    expect(setup().add("someone-else")).toMatchObject({ ok: false });
  });
});

describe("purchase status", () => {
  it("never counts refunded purchases", () => {
    const s = setup({
      applications: [app("a1", "s1", 100)],
      purchases: [buy("school_credit", 90, { quantity: 5, status: "refunded" }), buy("unlimited", 80, { studentId: "s1", status: "refunded" })],
    });
    expect(s.ent.credits).toBe(0);
    expect(s.ent.unlimitedStudentIds).toEqual([]);
    expect(s.state.hasPurchases).toBe(false);
  });

  it("counts simulated purchases only when allowed (never in production)", () => {
    const purchases = [buy("school_credit", 5, { quantity: 2, status: "simulated" })];
    const applications = [app("a1", "s1", 10)];
    expect(setup({ applications, purchases, countSimulated: true }).ent.credits).toBe(2);
    expect(setup({ applications, purchases, countSimulated: false }).ent.credits).toBe(0);
  });
});

describe("purchase requests", () => {
  it("accepts well-formed requests", () => {
    expect(parsePurchaseRequest({ kind: "school_credit", quantity: 3 })).toEqual({ ok: true, value: { kind: "school_credit", quantity: 3, studentId: null } });
    expect(parsePurchaseRequest({ kind: "school_credit" })).toEqual({ ok: true, value: { kind: "school_credit", quantity: 1, studentId: null } });
    expect(parsePurchaseRequest({ kind: "unlimited", studentId: " s1 " })).toEqual({ ok: true, value: { kind: "unlimited", quantity: 1, studentId: "s1" } });
    expect(parsePurchaseRequest({ kind: "counselor", studentId: "ignored" })).toEqual({ ok: true, value: { kind: "counselor", quantity: 1, studentId: null } });
  });

  it("rejects anything else", () => {
    for (const body of [
      null,
      [],
      "school_credit",
      { kind: "lifetime" },
      { kind: "school_credit", quantity: 0 },
      { kind: "school_credit", quantity: 1.5 },
      { kind: "school_credit", quantity: 21 },
      { kind: "school_credit", quantity: "2" },
      { kind: "unlimited" },
      { kind: "unlimited", quantity: 2, studentId: "s1" },
      { kind: "counselor", quantity: 3 },
    ]) {
      expect(parsePurchaseRequest(body).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it("refuses unlimited for a student the account does not have", () => {
    expect(setup().purchase({ kind: "unlimited", quantity: 1, studentId: "other" })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("plans", () => {
  it("reads prices from the environment and falls back to the defaults", () => {
    expect(billingConfig({})).toEqual({ schoolCents: 900, unlimitedCents: 2900, counselorCents: 19900, counselorMaxStudents: 25 });
    expect(billingConfig({ PRICE_SCHOOL_CENTS: "1200", COUNSELOR_MAX_STUDENTS: "40" })).toMatchObject({ schoolCents: 1200, counselorMaxStudents: 40 });
    expect(billingConfig({ PRICE_SCHOOL_CENTS: "free", PRICE_UNLIMITED_CENTS: "10", COUNSELOR_MAX_STUDENTS: "-1" })).toEqual({
      schoolCents: 900,
      unlimitedCents: 2900,
      counselorCents: 19900,
      counselorMaxStudents: 25,
    });
  });

  it("formats prices and states the rules with the configured numbers", () => {
    expect(formatMoney(900)).toBe("$9");
    expect(formatMoney(19900)).toBe("$199");
    expect(formatMoney(950)).toBe("$9.50");
    expect(unlimitedBreakEven(config)).toBe(4);
    const rules = countingRules({ ...config, schoolCents: 1000, counselorMaxStudents: 30 }).join(" ");
    expect(rules).toContain("($10)");
    expect(rules).toContain("up to 30 students");
  });
});
