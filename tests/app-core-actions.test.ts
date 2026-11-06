/**
 * App core server actions against the in-memory database: onboarding, add a
 * school, save a profile, manage students, remove a school.
 * Next request APIs, auth, research, and billing are mocked. Fictional data only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/auth/session";
import type { School } from "@/lib/types";

const h = vi.hoisted(() => {
  const EXAMPLE = {
    id: "example",
    name: "Example University",
    shortName: "Example",
    city: "Example City",
    state: "EX",
    officialDomains: ["example.edu"],
    officialHosts: [],
    units: [
      { id: "engineering", name: "School of Engineering", aliases: [], hosts: [] },
      { id: "arts", name: "College of Arts and Sciences", aliases: [], hosts: [] },
    ],
    prompts: [
      {
        id: "example-why",
        schoolId: "example",
        unitIds: [],
        cycle: "2026-27",
        kind: "why_school",
        title: "Why Example",
        text: "Which parts of Example University fit the way you want to learn?",
        wordLimit: { max: 250 },
        sourceUrl: "https://admissions.example.edu/supplement",
        verifiedAt: "2026-11-05",
      },
    ],
    seedUrls: [],
  };
  return {
    user: null as User | null,
    cookies: new Map<string, string>(),
    EXAMPLE,
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (h.cookies.has(name) ? { name, value: h.cookies.get(name) } : undefined),
    set: (name: string, value: string) => void h.cookies.set(name, value),
    delete: (name: string) => void h.cookies.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => {
    if (!h.user) throw new Error("NEXT_REDIRECT:/login");
    return h.user;
  }),
  getCurrentUser: vi.fn(async () => h.user),
  getUserOr401: vi.fn(async () => h.user ?? Response.json({ error: "Sign in required" }, { status: 401 })),
}));
vi.mock("@/lib/research/runner", () => ({ startResearch: vi.fn(async () => ({ runId: "run-test" })) }));
vi.mock("@/lib/billing/entitlements", () => ({
  canAddSchool: vi.fn(async () => ({ ok: true, uses: "free" })),
  canAddStudent: vi.fn(async () => ({ ok: true })),
  getEntitlements: vi.fn(),
}));
vi.mock("@/lib/schools/registry", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/schools/registry")>();
  return { ...mod, getSchool: (id: string) => (id === "example" ? (h.EXAMPLE as unknown as School) : mod.getSchool(id)) };
});

import { removeApplicationAction } from "@/app/app/_dashboard/actions";
import { saveProfileAction } from "@/app/app/profile/actions";
import { addSchoolAction } from "@/app/app/schools/new/actions";
import { addStudentAction, deleteStudentAction, openStudentAction, updateStudentAction } from "@/app/app/students/actions";
import { completeOnboardingAction } from "@/app/onboarding/actions";
import { canAddSchool, canAddStudent } from "@/lib/billing/entitlements";
import { getApplicationById, listApplications } from "@/lib/data/applications";
import { ACTIVE_STUDENT_COOKIE, createStudent, getStudent, listStudents } from "@/lib/data/students";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { startResearch } from "@/lib/research/runner";
import { eq } from "drizzle-orm";

async function newUser(role: User["role"]): Promise<User> {
  const id = `u-${newId(6)}`;
  const u: User = { id, email: `${id}@example.com`, name: null, role, createdAt: new Date(), updatedAt: new Date() };
  const db = await getDb();
  await db.insert(users).values({ id: u.id, email: u.email, role: u.role });
  return u;
}

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function roleOf(userId: string) {
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row;
}

beforeEach(() => {
  h.cookies.clear();
  vi.mocked(startResearch).mockClear();
});

describe("onboarding", () => {
  it("sets up a student account with its own profile, then opens the profile", async () => {
    h.user = await newUser(null);
    await expect(
      completeOnboardingAction({ status: "idle" }, form({ role: "student", yourName: " Alex  Example ", graduationYear: "2027", highSchool: "Example High School" })),
    ).rejects.toThrow("NEXT_REDIRECT:/app/profile");
    const [student] = await listStudents(h.user.id);
    expect(student).toMatchObject({ name: "Alex Example", graduationYear: 2027, highSchool: "Example High School", isSelf: true });
    expect(await roleOf(h.user.id)).toMatchObject({ role: "student", name: "Alex Example" });
    expect(h.cookies.get(ACTIVE_STUDENT_COOKIE)).toBe(student.id);
  });

  it("sets up a counselor with the first student, then opens the students list", async () => {
    h.user = await newUser(null);
    await expect(
      completeOnboardingAction({ status: "idle" }, form({ role: "counselor", yourName: "Casey Counselor", studentName: "Sam Example", graduationYear: "2028" })),
    ).rejects.toThrow("NEXT_REDIRECT:/app/students");
    const students = await listStudents(h.user.id);
    expect(students).toHaveLength(1);
    expect(students[0]).toMatchObject({ name: "Sam Example", isSelf: false, highSchool: null });
    expect(await roleOf(h.user.id)).toMatchObject({ role: "counselor", name: "Casey Counselor" });
  });

  it("explains what is missing and creates nothing", async () => {
    h.user = await newUser(null);
    expect(await completeOnboardingAction({ status: "idle" }, form({}))).toEqual({ status: "error", errors: { role: "Choose who this account is for." } });
    const r = await completeOnboardingAction({ status: "idle" }, form({ role: "parent", yourName: "", studentName: "", graduationYear: "2027" }));
    expect(r).toMatchObject({ status: "error", errors: { yourName: "Enter your name.", studentName: "Enter the student's name." } });
    expect(await listStudents(h.user.id)).toHaveLength(0);
  });

  it("does not create a second profile on a repeated submit", async () => {
    h.user = await newUser(null);
    const fields = form({ role: "student", yourName: "Alex Example", graduationYear: "2027" });
    await expect(completeOnboardingAction({ status: "idle" }, fields)).rejects.toThrow("NEXT_REDIRECT:/app/profile");
    h.user = { ...h.user, role: "student" };
    await expect(completeOnboardingAction({ status: "idle" }, fields)).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(await listStudents(h.user.id)).toHaveLength(1);
  });
});

describe("add a school", () => {
  it("creates the application with the library prompt, starts research, and opens the live view", async () => {
    h.user = await newUser("student");
    const student = await createStudent(h.user.id, { name: "Alex Example", graduationYear: 2027, isSelf: true });
    const fields = { studentId: student.id, schoolId: "example", unitId: "engineering", promptChoice: "example-why", customPrompt: "", customWordLimit: "" };
    let redirectTo = "";
    await addSchoolAction({ status: "idle" }, form(fields)).catch((e: Error) => (redirectTo = e.message));
    const [app] = await listApplications(h.user.id, student.id);
    expect(redirectTo).toBe(`NEXT_REDIRECT:/app/schools/${app.id}/research`);
    expect(app).toMatchObject({ schoolId: "example", unitId: "engineering", promptId: "example-why", wordLimit: 250, status: "queued" });
    expect(app.promptText).toBe("Which parts of Example University fit the way you want to learn?");
    expect(startResearch).toHaveBeenCalledWith(app.id);

    // The same school and unit again is refused, with a link to the existing one.
    const again = await addSchoolAction({ status: "idle" }, form(fields));
    expect(again).toMatchObject({ status: "error", duplicateOf: app.id });
  });

  it("shows the plan's reason when the account cannot add another school", async () => {
    h.user = await newUser("student");
    const student = await createStudent(h.user.id, { name: "Alex Example", graduationYear: 2027, isSelf: true });
    vi.mocked(canAddSchool).mockResolvedValueOnce({ ok: false, reason: "Your free school is used. Buy a school credit or go unlimited." });
    const r = await addSchoolAction(
      { status: "idle" },
      form({ studentId: student.id, schoolId: "example", unitId: "arts", promptChoice: "example-why", customPrompt: "", customWordLimit: "" }),
    );
    expect(r).toEqual({ status: "error", errors: { form: "Your free school is used. Buy a school credit or go unlimited." }, blocked: true });
    expect(await listApplications(h.user.id, student.id)).toHaveLength(0);
  });

  it("marks the school failed when research cannot start, and still opens it", async () => {
    h.user = await newUser("student");
    const student = await createStudent(h.user.id, { name: "Alex Example", graduationYear: 2027, isSelf: true });
    vi.mocked(startResearch).mockRejectedValueOnce(new Error("runner offline"));
    await expect(
      addSchoolAction(
        { status: "idle" },
        form({ studentId: student.id, schoolId: "example", unitId: "arts", promptChoice: "custom", customPrompt: "Which parts of Example fit you best?", customWordLimit: "200" }),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT:\/app\/schools\/.+\/research/);
    const [app] = await listApplications(h.user.id, student.id);
    expect(app).toMatchObject({ status: "failed", promptId: null, wordLimit: 200 });
    expect(app.error).toMatch(/could not start/);
  });

  it("will not add a school to another account's student", async () => {
    const owner = await newUser("parent");
    const student = await createStudent(owner.id, { name: "Sam Example", graduationYear: 2027 });
    h.user = await newUser("parent");
    const r = await addSchoolAction(
      { status: "idle" },
      form({ studentId: student.id, schoolId: "example", unitId: "arts", promptChoice: "example-why", customPrompt: "", customWordLimit: "" }),
    );
    expect(r).toMatchObject({ status: "error", errors: { form: expect.stringMatching(/could not be found/) } });
  });
});

describe("profile save", () => {
  it("validates, normalizes, and saves the whole profile", async () => {
    h.user = await newUser("student");
    const student = await createStudent(h.user.id, { name: "Alex Example", graduationYear: 2027, isSelf: true });
    const r = await saveProfileAction({
      studentId: student.id,
      name: "Alex Example",
      graduationYear: 2028,
      highSchool: "Example High School",
      location: "",
      intendedMajors: ["Environmental Engineering", "environmental engineering"],
      interests: ["water quality"],
      activities: [{ id: "act-creek", title: " Example Creek Monitors ", role: "Founder", description: "Built 6 sensors.", hoursPerWeek: "5", weeksPerYear: "40" }],
      activitiesSource: "Activity type: Environmental",
    });
    expect(r.ok).toBe(true);
    const saved = await getStudent(h.user.id, student.id);
    expect(saved).toMatchObject({
      graduationYear: 2028,
      highSchool: "Example High School",
      location: null,
      intendedMajors: ["Environmental Engineering"],
      activitiesSource: "Activity type: Environmental",
    });
    expect(saved?.activities).toEqual([{ id: "act-creek", title: "Example Creek Monitors", role: "Founder", description: "Built 6 sensors.", hoursPerWeek: 5, weeksPerYear: 40 }]);
  });

  it("returns field errors and saves nothing when invalid", async () => {
    h.user = await newUser("student");
    const student = await createStudent(h.user.id, { name: "Alex Example", graduationYear: 2027, isSelf: true });
    const r = await saveProfileAction({ studentId: student.id, name: "", graduationYear: 2027, activities: [{ title: "" }] });
    expect(r).toMatchObject({ ok: false, errors: { name: "Enter a name.", "activities.0.title": "Give this activity a title." }, message: "2 fields need attention." });
    expect((await getStudent(h.user.id, student.id))?.name).toBe("Alex Example");
  });

  it("cannot save another account's student", async () => {
    const owner = await newUser("parent");
    const student = await createStudent(owner.id, { name: "Sam Example", graduationYear: 2027 });
    h.user = await newUser("parent");
    const r = await saveProfileAction({ studentId: student.id, name: "Changed", graduationYear: 2027 });
    expect(r.ok).toBe(false);
    expect((await getStudent(owner.id, student.id))?.name).toBe("Sam Example");
  });
});

describe("students", () => {
  it("adds, edits, opens, and deletes students (deleting cascades to their schools)", async () => {
    h.user = await newUser("counselor");
    const added = await addStudentAction({ status: "idle" }, form({ name: "Sam Example", graduationYear: "2027", highSchool: "", location: "" }));
    expect(added).toMatchObject({ status: "ok", message: "Added Sam Example." });
    const [student] = await listStudents(h.user.id);

    const edited = await updateStudentAction({ status: "idle" }, form({ studentId: student.id, name: "Sam Q. Example", graduationYear: "2028", highSchool: "Example High School", location: "Example City, EX" }));
    expect(edited).toMatchObject({ status: "ok" });
    expect(await getStudent(h.user.id, student.id)).toMatchObject({ name: "Sam Q. Example", graduationYear: 2028, location: "Example City, EX" });

    await expect(openStudentAction(form({ studentId: student.id, next: "/app/profile" }))).rejects.toThrow("NEXT_REDIRECT:/app/profile");
    expect(h.cookies.get(ACTIVE_STUDENT_COOKIE)).toBe(student.id);
    await expect(openStudentAction(form({ studentId: student.id, next: "https://elsewhere.example" }))).rejects.toThrow("NEXT_REDIRECT:/app/students");

    await addSchoolAction(
      { status: "idle" },
      form({ studentId: student.id, schoolId: "example", unitId: "arts", promptChoice: "example-why", customPrompt: "", customWordLimit: "" }),
    ).catch(() => undefined);
    const [app] = await listApplications(h.user.id, student.id);
    expect(app).toBeTruthy();

    const deleted = await deleteStudentAction(student.id);
    expect(deleted.ok).toBe(true);
    expect(await listStudents(h.user.id)).toHaveLength(0);
    expect(await getApplicationById(app.id)).toBeNull();
    expect(h.cookies.has(ACTIVE_STUDENT_COOKIE)).toBe(false);
  });

  it("respects the plan's student limit and validates basics", async () => {
    h.user = await newUser("parent");
    vi.mocked(canAddStudent).mockResolvedValueOnce({ ok: false, reason: "Parent accounts include one student. The counselor plan covers more." });
    expect(await addStudentAction({ status: "idle" }, form({ name: "Sam Example", graduationYear: "2027" }))).toMatchObject({ status: "error", blocked: true });
    expect(await addStudentAction({ status: "idle" }, form({ name: " ", graduationYear: "2027" }))).toMatchObject({
      status: "error",
      errors: { name: "Enter the student's name." },
    });
  });

  it("keeps a student account's own profile out of reach", async () => {
    h.user = await newUser("student");
    const own = await createStudent(h.user.id, { name: "Alex Example", graduationYear: 2027, isSelf: true });
    expect(await addStudentAction({ status: "idle" }, form({ name: "Another", graduationYear: "2027" }))).toMatchObject({ status: "error" });
    expect(await deleteStudentAction(own.id)).toMatchObject({ ok: false });
  });
});

describe("remove a school", () => {
  it("deletes only the owner's application", async () => {
    h.user = await newUser("student");
    const student = await createStudent(h.user.id, { name: "Alex Example", graduationYear: 2027, isSelf: true });
    await addSchoolAction(
      { status: "idle" },
      form({ studentId: student.id, schoolId: "example", unitId: "arts", promptChoice: "example-why", customPrompt: "", customWordLimit: "" }),
    ).catch(() => undefined);
    const [app] = await listApplications(h.user.id, student.id);
    const owner = h.user;

    h.user = await newUser("student");
    expect(await removeApplicationAction(app.id)).toMatchObject({ ok: false });
    expect(await getApplicationById(app.id)).not.toBeNull();

    h.user = owner;
    expect(await removeApplicationAction(app.id)).toEqual({ ok: true });
    expect(await getApplicationById(app.id)).toBeNull();
  });
});
