/**
 * Draft checker routes and pages against the in-memory database:
 * POST /api/draft/check (owner-checked, never stores the draft), the
 * /app/draft picker, and the /app/draft/[applicationId] checker page.
 * School details in drafts come from the bundled verified corpora.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/auth/session";

const auth = vi.hoisted(() => ({ user: null as User | null }));

vi.mock("@/lib/auth/session", () => ({
  getUserOr401: vi.fn(async () => auth.user ?? Response.json({ error: "Sign in required" }, { status: 401 })),
  getCurrentUser: vi.fn(async () => auth.user),
  requireUser: vi.fn(async () => {
    if (!auth.user) throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    return auth.user;
  }),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "localhost:3000" })),
  cookies: vi.fn(async () => ({ get: () => undefined, has: () => false })),
}));

import { POST as checkRoute } from "@/app/api/draft/check/route";
import DraftCheckPage, { generateMetadata } from "@/app/app/draft/[applicationId]/page";
import DraftSchoolNotFound from "@/app/app/draft/[applicationId]/not-found";
import DraftPickerPage from "@/app/app/draft/page";
import { createApplication, setApplicationStatus } from "@/lib/data/applications";
import { createStudent } from "@/lib/data/students";
import { getDb, schema } from "@/lib/db/client";
import { NEVER_REWRITES, UNVERIFIED_MESSAGE } from "@/lib/draft/messages";
import { WORD_COUNT_RULE } from "@/lib/draft/text";
import { newId } from "@/lib/ids";
import { seedCorpus } from "@/lib/research/corpus-data";
import type { DraftCheckResult } from "@/lib/types";

function makeUser(role: User["role"]): User {
  const id = `u-${newId(6)}`;
  return { id, email: `${id}@example.com`, name: null, role, createdAt: new Date(), updatedAt: new Date() };
}

const owner = makeUser("student");
const stranger = makeUser("student");
const ids = { student: "", dartmouth: "", cornell: "" };

const CODE = /^([A-Z]{2,8})[ -]?(\d{1,4}[A-Z]?(?:\.\d{1,3})?)\b/;
const course = (seedCorpus("dartmouth")?.facts ?? []).find((f) => f.kind === "course" && CODE.test(f.title) && f.verifiedAt);
const code = course ? `${CODE.exec(course.title)![1]} ${CODE.exec(course.title)![2]}` : null;

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return checkRoute(
    new Request("http://localhost:3000/api/draft/check", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

async function digestOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return String((err as { digest?: string }).digest ?? (err as Error).message);
  }
  return "";
}

async function rowCounts(): Promise<Record<string, number>> {
  const db = await getDb();
  const tables = {
    users: schema.users,
    sessions: schema.sessions,
    loginTokens: schema.loginTokens,
    students: schema.students,
    applications: schema.applications,
    researchRuns: schema.researchRuns,
    researchEvents: schema.researchEvents,
    corpusFacts: schema.corpusFacts,
    pages: schema.pages,
    dossiers: schema.dossiers,
    shareLinks: schema.shareLinks,
    purchases: schema.purchases,
  };
  const out: Record<string, number> = {};
  for (const [name, table] of Object.entries(tables)) out[name] = (await db.select().from(table)).length;
  return out;
}

beforeAll(async () => {
  const db = await getDb();
  await db.insert(schema.users).values([owner, stranger].map(({ id, email, role }) => ({ id, email, role })));
  const student = await createStudent(owner.id, { name: "Alex Example", graduationYear: 2027, isSelf: true, location: "Riverton, Ohio" });
  ids.student = student.id;
  const dartmouth = await createApplication({
    studentId: student.id,
    schoolId: "dartmouth",
    unitId: "college",
    promptId: null,
    promptText: "A pasted prompt used only in this test.",
    wordLimit: 60,
  });
  const cornell = await createApplication({
    studentId: student.id,
    schoolId: "cornell",
    unitId: "engineering",
    promptId: null,
    promptText: "Another pasted prompt used only in this test.",
    wordLimit: null,
  });
  ids.dartmouth = dartmouth.id;
  ids.cornell = cornell.id;
  await setApplicationStatus(dartmouth.id, "researching", 40);
  await setApplicationStatus(cornell.id, "ready", 100);
});

afterAll(() => {
  auth.user = null;
});

describe("POST /api/draft/check", () => {
  it("requires a signed-in owner of the application", async () => {
    auth.user = null;
    expect((await post({ applicationId: ids.dartmouth, text: "Hello." })).status).toBe(401);
    auth.user = stranger;
    const res = await post({ applicationId: ids.dartmouth, text: "Hello." });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "That school is not on your list." });
  });

  it("refuses requests from other sites and malformed requests", async () => {
    auth.user = owner;
    expect((await post({ applicationId: ids.dartmouth, text: "Hello." }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post({ applicationId: ids.dartmouth, text: "Hello." }, { "content-type": "text/plain" })).status).toBe(415);
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ text: "Hello." })).status).toBe(400);
    const empty = await post({ applicationId: ids.dartmouth, text: "   " });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "Paste your draft first." });
    expect((await post({ applicationId: ids.dartmouth, text: "word ".repeat(5000) })).status).toBe(413);
  });

  it.skipIf(!code)("checks the draft against the school's research and the student's other schools, and stores nothing", async () => {
    auth.user = owner;
    const text = `At Dartmouth, I want to take ${code}. Dartmouth offers many opportunities that will help me grow. I also applied to Cornell University.`;
    const before = await rowCounts();
    const res = await post({ applicationId: ids.dartmouth, text });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const result = (await res.json()) as DraftCheckResult;
    expect(result.wordCount).toBe(text.trim().split(/\s+/).length);
    expect(result.wordLimit).toBe(60);
    expect(result.withinLimit).toBe(true);
    const verified = result.issues.find((i) => i.type === "verified_claim" && i.excerpt === code);
    expect(verified?.sourceUrl).toBe(course!.sourceUrl);
    expect(result.issues.find((i) => i.type === "wrong_school")).toMatchObject({
      excerpt: "Cornell University",
      otherSchools: [{ schoolId: "cornell", schoolName: "Cornell" }],
    });
    expect(result.issues.find((i) => i.type === "generic")?.excerpt).toBe("Dartmouth offers many opportunities that will help me grow.");
    expect(result.issues.some((i) => i.message === UNVERIFIED_MESSAGE)).toBe(false);

    // The corpus may be seeded on first use; nothing else is written.
    const after = await rowCounts();
    expect({ ...after, corpusFacts: 0 }).toEqual({ ...before, corpusFacts: 0 });
    const again = await post({ applicationId: ids.dartmouth, text });
    expect(again.status).toBe(200);
    expect(await rowCounts()).toEqual(after);
  });
});

describe("draft pages", () => {
  it("lists the student's schools with researched ones first", async () => {
    auth.user = owner;
    const html = renderToStaticMarkup(await DraftPickerPage());
    expect(html).toContain("Draft check");
    expect(html.indexOf("Cornell University")).toBeGreaterThan(-1);
    expect(html.indexOf("Cornell University")).toBeLessThan(html.indexOf("Dartmouth College"));
    expect(html).toContain(`href="/app/draft/${ids.cornell}"`);
    expect(html).toContain(`href="/app/draft/${ids.dartmouth}"`);
    expect(html).toContain("Research ready");
    expect(html).toContain("Researching");
    expect(html).toContain(NEVER_REWRITES);
  });

  it("renders the checker for the owner, with the prompt and the word-count rule", async () => {
    auth.user = owner;
    const html = renderToStaticMarkup(await DraftCheckPage({ params: Promise.resolve({ applicationId: ids.dartmouth }) }));
    expect(html).toContain("Dartmouth College");
    expect(html).toContain("A pasted prompt used only in this test.");
    expect(html).toContain("Your draft");
    expect(html).toContain("Check draft");
    expect(html).toContain(WORD_COUNT_RULE);
    expect(html).toContain(NEVER_REWRITES);
    expect(html).toContain('href="/app/draft"');
    // The dossier link appears only once research is ready.
    expect(html).not.toContain(`href="/app/schools/${ids.dartmouth}"`);
    const ready = renderToStaticMarkup(await DraftCheckPage({ params: Promise.resolve({ applicationId: ids.cornell }) }));
    expect(ready).toContain(`href="/app/schools/${ids.cornell}"`);
    expect(ready).toContain("No word limit for this prompt");

    expect((await generateMetadata({ params: Promise.resolve({ applicationId: ids.dartmouth }) })).title).toBe("Dartmouth draft check");
  });

  it("hides other accounts' schools", async () => {
    auth.user = stranger;
    expect(await digestOf(DraftCheckPage({ params: Promise.resolve({ applicationId: ids.dartmouth }) }))).toContain("404");
    expect((await generateMetadata({ params: Promise.resolve({ applicationId: ids.dartmouth }) })).title).toBe("Draft check");
    expect(renderToStaticMarkup(DraftSchoolNotFound())).toContain("This school is not on your list");
  });
});
