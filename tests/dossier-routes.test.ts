import { NextRequest, connection } from "next/server";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real session helpers read request cookies, which exist only inside Next.
vi.mock("@/lib/auth/session", () => ({
  getUserOr401: vi.fn(),
  getCurrentUser: vi.fn(),
  requireUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "localhost:3000" })),
  cookies: vi.fn(async () => ({ get: () => undefined, has: () => false })),
}));
// connection() needs a live Next request scope; the page awaits it to stay request-time rendered.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  usePathname: () => "/app",
}));

import { DELETE as shareDELETE, GET as shareGET, POST as sharePOST } from "@/app/api/dossiers/[dossierId]/share/route";
import { GET as pdfGET } from "@/app/api/dossiers/[dossierId]/pdf/route";
import DossierPage from "@/app/app/schools/[applicationId]/page";
import { metadata as sharedLayoutMetadata } from "@/app/d/[token]/layout";
import SharedDossierPage, { generateMetadata as sharedMetadata } from "@/app/d/[token]/page";
import { getCurrentUser, getUserOr401, requireUser } from "@/lib/auth/session";
import { createApplication, setApplicationStatus } from "@/lib/data/applications";
import { getSharedDossier, saveDossier } from "@/lib/data/dossiers";
import { getDb } from "@/lib/db/client";
import { students, users } from "@/lib/db/schema";
import { EXAMPLE_DOSSIER } from "@/lib/fixtures/example-dossier";

type UserRow = Awaited<ReturnType<typeof getCurrentUser>>;

const now = new Date("2026-11-05T15:00:00Z");
const OWNER = { id: "owner-1", email: "owner@example.com", name: "Pat Owner", role: "counselor", createdAt: now, updatedAt: now } as NonNullable<UserRow>;
const OTHER = { id: "other-1", email: "other@example.com", name: null, role: "student", createdAt: now, updatedAt: now } as NonNullable<UserRow>;

const ids = { ready: "", busy: "", empty: "" };
const DOSSIER_ID = "dossier-routes-1";

function signIn(user: NonNullable<UserRow> | null) {
  vi.mocked(getUserOr401).mockResolvedValue(user ?? Response.json({ error: "Sign in required" }, { status: 401 }));
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  vi.mocked(requireUser).mockImplementation(async () => {
    if (!user) throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    return user;
  });
}

function ctx(dossierId: string) {
  return { params: Promise.resolve({ dossierId }) };
}

function req(method: string, path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${path}`, { method, headers: { "sec-fetch-site": "same-origin", ...headers } });
}

async function digestOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return String((err as { digest?: string }).digest ?? (err as Error).message);
  }
  return "";
}

beforeAll(async () => {
  vi.stubEnv("APP_URL", "https://whyus.test");
  const db = await getDb();
  await db.insert(users).values([
    { id: OWNER.id, email: OWNER.email, name: OWNER.name, role: "counselor" },
    { id: OTHER.id, email: OTHER.email, role: "student" },
  ]);
  await db.insert(students).values({ id: "student-1", ownerUserId: OWNER.id, name: "Sam Rivera", graduationYear: 2027 });
  const base = { studentId: "student-1", schoolId: "example", promptId: null, promptText: EXAMPLE_DOSSIER.prompt.text, wordLimit: 150 };
  const ready = await createApplication({ ...base, unitId: "engineering" });
  const busy = await createApplication({ ...base, unitId: "arts" });
  const empty = await createApplication({ ...base, unitId: "sciences" });
  Object.assign(ids, { ready: ready.id, busy: busy.id, empty: empty.id });
  await setApplicationStatus(ready.id, "ready", 100);
  await setApplicationStatus(busy.id, "researching", 40);
  await setApplicationStatus(empty.id, "ready", 100);
  await saveDossier({ ...EXAMPLE_DOSSIER, id: DOSSIER_ID, applicationId: ready.id, studentId: "student-1" });
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => signIn(OWNER));

describe("share link API", () => {
  it("requires a signed-in owner", async () => {
    signIn(null);
    expect((await sharePOST(req("POST", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID))).status).toBe(401);
    signIn(OTHER);
    expect((await sharePOST(req("POST", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID))).status).toBe(404);
    expect((await shareDELETE(req("DELETE", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID))).status).toBe(404);
    expect((await shareGET(req("GET", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID))).status).toBe(404);
    expect((await sharePOST(req("POST", `/api/dossiers/missing/share`), ctx("missing"))).status).toBe(404);
  });

  it("refuses cross-site requests", async () => {
    const crossSite = await sharePOST(req("POST", `/api/dossiers/${DOSSIER_ID}/share`, { "sec-fetch-site": "cross-site" }), ctx(DOSSIER_ID));
    expect(crossSite.status).toBe(403);
    const foreignOrigin = await shareDELETE(
      req("DELETE", `/api/dossiers/${DOSSIER_ID}/share`, { origin: "https://evil.example", "sec-fetch-site": "same-origin" }),
      ctx(DOSSIER_ID),
    );
    expect(foreignOrigin.status).toBe(403);
  });

  it("creates, reuses, reads, and revokes a share link", async () => {
    const created = await sharePOST(req("POST", `/api/dossiers/${DOSSIER_ID}/share`, { origin: "http://localhost:3000" }), ctx(DOSSIER_ID));
    expect(created.status).toBe(200);
    expect(created.headers.get("cache-control")).toContain("no-store");
    const { url } = (await created.json()) as { url: string };
    expect(url).toMatch(/^https:\/\/whyus\.test\/d\/[A-Za-z0-9_-]{20,}$/);
    const token = url.split("/d/")[1];
    expect((await getSharedDossier(token))?.id).toBe(DOSSIER_ID);

    const again = (await (await sharePOST(req("POST", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID))).json()) as { url: string };
    expect(again.url).toBe(url);
    expect(await (await shareGET(req("GET", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID))).json()).toEqual({ url });

    const revoked = await shareDELETE(req("DELETE", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID));
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ revoked: true });
    expect(await getSharedDossier(token)).toBeNull();
    expect(await (await shareGET(req("GET", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID))).json()).toEqual({ url: null });

    const fresh = (await (await sharePOST(req("POST", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID))).json()) as { url: string };
    expect(fresh.url).not.toBe(url);
    await shareDELETE(req("DELETE", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID));
  });
});

describe("PDF API", () => {
  it("returns the dossier as a PDF attachment for its owner only", async () => {
    const res = await pdfGET(req("GET", `/api/dossiers/${DOSSIER_ID}/pdf`), ctx(DOSSIER_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="whyus-example-dossier.pdf"');
    expect(res.headers.get("cache-control")).toContain("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(Number(res.headers.get("content-length"))).toBe(bytes.byteLength);

    signIn(OTHER);
    expect((await pdfGET(req("GET", `/api/dossiers/${DOSSIER_ID}/pdf`), ctx(DOSSIER_ID))).status).toBe(404);
    signIn(null);
    expect((await pdfGET(req("GET", `/api/dossiers/${DOSSIER_ID}/pdf`), ctx(DOSSIER_ID))).status).toBe(401);
  });
});

describe("dossier page", () => {
  it("renders the briefing with its actions for the owner", async () => {
    const el = await DossierPage({ params: Promise.resolve({ applicationId: ids.ready }) });
    expect(isValidElement(el)).toBe(true);
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Example University");
    expect(html).toContain("Copy share link");
    expect(html).toContain("Export PDF");
    expect(html).toContain(`href="/api/dossiers/${DOSSIER_ID}/pdf"`);
    expect(html).toContain('download="whyus-example-dossier.pdf"');
    expect(html).toContain(`href="/app/draft/${ids.ready}"`);
    expect(html).toContain("Run research again");
    expect(html).toContain("Prepared for");
    expect(html).toContain(">Sam<");
    expect(html).not.toContain("Rivera");
    expect(html).toContain('role="status"');
  });

  it("shows the active share link with a way to stop sharing", async () => {
    const created = (await (await sharePOST(req("POST", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID))).json()) as { url: string };
    const html = renderToStaticMarkup(await DossierPage({ params: Promise.resolve({ applicationId: ids.ready }) }));
    expect(html).toContain(`value="${created.url}"`);
    expect(html).toContain("Stop sharing");
    await shareDELETE(req("DELETE", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID));
  });

  it("sends unfinished research to the live view and hides other accounts' schools", async () => {
    expect(await digestOf(DossierPage({ params: Promise.resolve({ applicationId: ids.busy }) }))).toContain(
      `/app/schools/${ids.busy}/research`,
    );
    signIn(OTHER);
    expect(await digestOf(DossierPage({ params: Promise.resolve({ applicationId: ids.ready }) }))).toContain("404");
  });

  it("offers to rebuild when a finished run saved no dossier", async () => {
    const html = renderToStaticMarkup(await DossierPage({ params: Promise.resolve({ applicationId: ids.empty }) }));
    expect(html).toContain("This dossier is not available");
    expect(html).toContain("Run research again");
  });
});

describe("shared page", () => {
  it("renders a read-only briefing with no account data and noindex metadata", async () => {
    const created = (await (await sharePOST(req("POST", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID))).json()) as { url: string };
    const token = created.url.split("/d/")[1];
    vi.mocked(connection).mockClear();
    const html = renderToStaticMarkup(await SharedDossierPage({ params: Promise.resolve({ token }) }));
    // Rendered per request, so a revoked link stops working at once.
    expect(vi.mocked(connection)).toHaveBeenCalled();
    expect(html).toContain("Example University");
    expect(html).toContain("Research note");
    expect(html).toContain('id="shared-detail-1"');
    for (const secret of ["owner@example.com", "Pat Owner", "Sam", "Rivera", "student-1", ids.ready, DOSSIER_ID]) {
      expect(html).not.toContain(secret);
    }
    expect(html).not.toContain("Copy share link");
    expect(html).not.toContain("Run research again");

    const meta = await sharedMetadata({ params: Promise.resolve({ token }) });
    expect(meta.title).toBe("Example University dossier");
    expect(meta.robots).toMatchObject({ index: false, follow: false });
    expect(sharedLayoutMetadata.robots).toMatchObject({ index: false, follow: false });
    expect(sharedLayoutMetadata.referrer).toBe("no-referrer");

    await shareDELETE(req("DELETE", `/api/dossiers/${DOSSIER_ID}/share`), ctx(DOSSIER_ID));
    expect(await digestOf(SharedDossierPage({ params: Promise.resolve({ token }) }))).toContain("404");
    expect(await digestOf(SharedDossierPage({ params: Promise.resolve({ token: "not-a-real-token" }) }))).toContain("404");
  });

  it("renders the not-found message for inactive links", async () => {
    const { default: NotFound } = await import("@/app/d/[token]/not-found");
    expect(renderToStaticMarkup(createElement(NotFound))).toContain("This link is not active");
  });
});
