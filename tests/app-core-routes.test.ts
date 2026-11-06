/**
 * App core API routes against the in-memory database:
 * GET /api/applications (dashboard polling) and POST /api/profile/parse.
 * Fictional data only (Example University).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/auth/session";
import { makeTestPdf } from "./helpers/make-test-pdf";

const auth = vi.hoisted(() => ({ user: null as User | null }));

vi.mock("@/lib/auth/session", () => ({
  getUserOr401: vi.fn(async () => auth.user ?? Response.json({ error: "Sign in required" }, { status: 401 })),
  getCurrentUser: vi.fn(async () => auth.user),
  requireUser: vi.fn(async () => {
    if (!auth.user) throw new Error("NEXT_REDIRECT:/login");
    return auth.user;
  }),
}));

import { GET as listApplicationsRoute } from "@/app/api/applications/route";
import { POST as parseRoute } from "@/app/api/profile/parse/route";
import { createApplication, setApplicationStatus } from "@/lib/data/applications";
import { saveDossier } from "@/lib/data/dossiers";
import { createStudent } from "@/lib/data/students";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { EXAMPLE_DOSSIER } from "@/lib/fixtures/example-dossier";
import { newId } from "@/lib/ids";

function makeUser(role: User["role"]): User {
  const id = `u-${newId(6)}`;
  return { id, email: `${id}@example.com`, name: null, role, createdAt: new Date(), updatedAt: new Date() };
}

describe("GET /api/applications", () => {
  const owner = makeUser("student");
  const stranger = makeUser("parent");
  let studentId = "";
  let readyId = "";

  beforeAll(async () => {
    const db = await getDb();
    await db.insert(users).values([owner, stranger].map(({ id, email, role }) => ({ id, email, role })));
    const student = await createStudent(owner.id, { name: "Alex Example", graduationYear: 2027, isSelf: true });
    studentId = student.id;
    const ready = await createApplication({
      studentId,
      schoolId: "example",
      unitId: "engineering",
      promptId: null,
      promptText: "Which parts of Example University fit the way you want to learn?",
      wordLimit: 250,
    });
    readyId = ready.id;
    await saveDossier({ ...EXAMPLE_DOSSIER, id: `d-${newId(6)}`, applicationId: ready.id, studentId });
    await setApplicationStatus(ready.id, "ready", 100);
    const live = await createApplication({
      studentId,
      schoolId: "example",
      unitId: "arts",
      promptId: null,
      promptText: "Which parts of Example University fit the way you want to learn?",
      wordLimit: null,
    });
    await setApplicationStatus(live.id, "researching", 35);
  });

  const call = (query: string) => listApplicationsRoute(new Request(`http://localhost/api/applications${query}`));

  it("returns the owner's rows with status, progress, and the dossier summary", async () => {
    auth.user = owner;
    const res = await call(`?studentId=${studentId}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { applications: { id: string; status: string; progress: number; uniquenessScore: number | null; leadAngle: string | null; schoolName: string }[] };
    expect(body.applications).toHaveLength(2);
    const ready = body.applications.find((a) => a.id === readyId)!;
    expect(ready).toMatchObject({ status: "ready", progress: 100, uniquenessScore: 74, schoolName: "Example University" });
    expect(ready.leadAngle).toMatch(/creek you instrumented/);
    expect(body.applications.find((a) => a.id !== readyId)).toMatchObject({ status: "researching", progress: 35, uniquenessScore: null, leadAngle: null });
  });

  it("is scoped to the owning account", async () => {
    auth.user = stranger;
    expect((await call(`?studentId=${studentId}`)).status).toBe(404);
    auth.user = null;
    expect((await call(`?studentId=${studentId}`)).status).toBe(401);
    auth.user = owner;
    expect((await call("")).status).toBe(400);
  });
});

describe("POST /api/profile/parse", () => {
  const user = makeUser("student");

  beforeAll(async () => {
    const db = await getDb();
    await db.insert(users).values({ id: user.id, email: user.email, role: user.role });
  });

  const post = (body: BodyInit, headers?: Record<string, string>) =>
    parseRoute(new Request("http://localhost/api/profile/parse", { method: "POST", body, headers }));

  const SAMPLE = [
    "Activity type: Robotics",
    "Position/Leadership description: Programming lead",
    "Organization Name: Example Robotics Team",
    "Please describe this activity, including what you accomplished and any recognition you received, etc.: Wrote the vision code for our competition robot.",
    "Participation grade levels: 10, 11, 12",
    "Hours spent per week: 9",
    "Weeks spent per year: 30",
  ];

  it("reads pasted text", async () => {
    auth.user = user;
    const form = new FormData();
    form.set("text", SAMPLE.join("\n"));
    const res = await post(form);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ engine: "deterministic", format: "commonapp", sourceKind: "text" });
    expect(body.activities).toEqual([
      expect.objectContaining({ title: "Example Robotics Team", role: "Programming lead", category: "Robotics", hoursPerWeek: 9, weeksPerYear: 30, grades: "10, 11, 12" }),
    ]);
  });

  it("reads JSON text", async () => {
    auth.user = user;
    const res = await post(JSON.stringify({ text: SAMPLE.join("\n") }), { "content-type": "application/json" });
    expect(res.status).toBe(200);
    expect((await res.json()).activities).toHaveLength(1);
  });

  it("reads an uploaded PDF and returns its text for the profile", async () => {
    auth.user = user;
    const form = new FormData();
    form.set("file", new File([makeTestPdf([SAMPLE])], "activities.pdf", { type: "application/pdf" }));
    const res = await post(form);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sourceKind).toBe("pdf");
    expect(body.fileName).toBe("activities.pdf");
    expect(body.sourceText).toContain("Example Robotics Team");
    expect(body.activities[0]).toMatchObject({ title: "Example Robotics Team", role: "Programming lead" });
  });

  it("rejects files that are not PDFs, oversized uploads, and empty requests", async () => {
    auth.user = user;
    const notPdf = new FormData();
    notPdf.set("file", new File(["hello"], "notes.pdf", { type: "application/pdf" }));
    expect((await post(notPdf)).status).toBe(415);

    const big = new FormData();
    big.set("file", new File([new Uint8Array(6 * 1024 * 1024)], "big.pdf", { type: "application/pdf" }));
    const tooLarge = await post(big);
    expect(tooLarge.status).toBe(413);
    expect((await tooLarge.json()).error).toMatch(/larger than 5 MB/);

    const empty = new FormData();
    empty.set("text", "   ");
    expect((await post(empty)).status).toBe(400);
    expect((await post("plain", { "content-type": "text/plain" })).status).toBe(415);
  });

  it("explains a PDF with no selectable text", async () => {
    auth.user = user;
    const form = new FormData();
    form.set("file", new File([makeTestPdf([[" "]])], "scan.pdf", { type: "application/pdf" }));
    const res = await post(form);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/no selectable text/);
  });

  it("requires sign-in", async () => {
    auth.user = null;
    const form = new FormData();
    form.set("text", "Debate");
    expect((await post(form)).status).toBe(401);
  });
});
