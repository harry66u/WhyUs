import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getApplicationById } from "@/lib/data/applications";
import { getDossierForApplication } from "@/lib/data/dossiers";
import { getDb } from "@/lib/db/client";
import { applications, researchRuns, students, users } from "@/lib/db/schema";
import type { Fact, ResearchEvent } from "@/lib/types";
import { NO_RESEARCH_BASE_MESSAGE } from "./pipeline";
import { getLatestRun, getRunEvents, INTERRUPTED_MESSAGE, overrideResearchDeps, reconcileRun, startResearch, waitForRun } from "./runner";
import { EXAMPLE_SCHOOL, fakeEngine, makeFact, pageTextFor, StubPageSource } from "./testing/example-school";

const USER = "runner-user";
const STUDENT_ID = "runner-student";

const facts: Fact[] = Array.from({ length: 8 }, (_, i) =>
  makeFact({
    id: `example:runner-${i}`,
    kind: (["course", "lab", "center", "organization"] as const)[i % 4],
    title: `Runner detail ${i}`,
    sourceUrl: `https://www.example.edu/runner/${i}`,
    quote: `Runner detail ${i} is a fictional opportunity used by the runner tests.`,
  }),
);
const pages = Object.fromEntries(facts.map((f) => [f.sourceUrl, { text: pageTextFor(f) }]));

let appCounter = 0;
async function newApplication(): Promise<string> {
  const db = await getDb();
  const id = `runner-app-${++appCounter}`;
  // One application per (student, school, unit): vary the unit to keep them distinct.
  await db.insert(applications).values({ id, studentId: STUDENT_ID, schoolId: "example", unitId: `unit-${appCounter}`, promptText: "Why Example University?", wordLimit: 150 });
  return id;
}

function useStubs(overrides: Parameters<typeof overrideResearchDeps>[0] = {}, delayMs = 20) {
  const engine = fakeEngine();
  const pageSource = new StubPageSource(pages, delayMs);
  overrideResearchDeps({
    getSchool: (id) => (id === "example" ? EXAMPLE_SCHOOL : undefined),
    loadSchoolFacts: async () => facts,
    pageSource,
    recordVerification: async () => {},
    upsertFacts: async () => {},
    rankFacts: engine.rankFacts,
    buildDossier: engine.buildDossier,
    coordinateAngles: engine.coordinateAngles,
    llmAvailable: () => false,
    claudeFetch: null,
    ...overrides,
  });
  return { engine, pageSource };
}

async function eventsOf(runId: string): Promise<ResearchEvent[]> {
  return (await getRunEvents(runId)).map((e) => e.event);
}

beforeAll(async () => {
  const db = await getDb();
  await db.insert(users).values({ id: USER, email: "runner@example.com", role: "student" });
  await db.insert(students).values({
    id: STUDENT_ID,
    ownerUserId: USER,
    name: "Runner Student",
    graduationYear: 2027,
    activities: [{ id: "act-sensors", title: "Creek Sensor Project", description: "Built water quality sensors." }],
  });
});

afterEach(() => overrideResearchDeps(null));

describe("research runner", () => {
  it("runs in the background, stores ordered events, saves the dossier, and marks the application ready", async () => {
    useStubs();
    const appId = await newApplication();
    const { runId } = await startResearch(appId);
    expect((await getLatestRun(appId))?.status).toBe("running");
    await waitForRun(runId);

    const run = await getLatestRun(appId);
    expect(run).toMatchObject({ id: runId, status: "done", error: null, engine: "deterministic" });
    expect(run?.finishedAt).not.toBeNull();

    const app = await getApplicationById(appId);
    expect(app).toMatchObject({ status: "ready", progress: 100, error: null });

    const stored = await getRunEvents(runId);
    expect(stored.length).toBeGreaterThan(10);
    for (let i = 1; i < stored.length; i++) expect(stored[i].seq).toBeGreaterThan(stored[i - 1].seq);
    expect(stored[0].event).toMatchObject({ type: "stage", stage: "scope", status: "start" });
    const last = stored[stored.length - 1].event;
    expect(last.type).toBe("done");

    // Replay after a cursor returns exactly the rest, in order.
    const cut = stored[4].seq;
    expect((await getRunEvents(runId, cut)).map((e) => e.seq)).toEqual(stored.slice(5).map((e) => e.seq));

    const dossier = await getDossierForApplication(USER, appId);
    expect(dossier?.id).toBe((last as Extract<ResearchEvent, { type: "done" }>).dossierId);
    expect(dossier?.details.length).toBeGreaterThanOrEqual(6);
  });

  it("returns the active run instead of starting a duplicate", async () => {
    useStubs({}, 40);
    const appId = await newApplication();
    const [a, b] = await Promise.all([startResearch(appId), startResearch(appId)]);
    expect(b.runId).toBe(a.runId);
    expect((await startResearch(appId)).runId).toBe(a.runId);
    expect((await startResearch(appId, { force: true })).runId).toBe(a.runId); // force never doubles an active run
    await waitForRun(a.runId);

    // A completed run is kept unless forced.
    expect((await startResearch(appId)).runId).toBe(a.runId);
    const forced = await startResearch(appId, { force: true });
    expect(forced.runId).not.toBe(a.runId);
    await waitForRun(forced.runId);

    const db = await getDb();
    const runs = await db.select().from(researchRuns).where(eq(researchRuns.applicationId, appId));
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.status === "done")).toBe(true);
  });

  it("turns any thrown error into a failed run with a readable message and an error event", async () => {
    useStubs({
      buildDossier: async () => {
        throw new Error("engine exploded");
      },
    });
    const appId = await newApplication();
    const { runId } = await startResearch(appId);
    await waitForRun(runId);

    const run = await getLatestRun(appId);
    expect(run?.status).toBe("failed");
    expect(run?.error).toMatch(/^Research stopped because of an unexpected problem \(engine exploded\)/);
    const app = await getApplicationById(appId);
    expect(app?.status).toBe("failed");
    expect(app?.error).toBe(run?.error);

    const events = await eventsOf(runId);
    expect(events[events.length - 1]).toEqual({ type: "error", message: run?.error });
    expect(events.some((e) => e.type === "done")).toBe(false);
    expect(await getDossierForApplication(USER, appId)).toBeNull();

    // Starting again after a failure retries with a new run.
    useStubs();
    const retry = await startResearch(appId);
    expect(retry.runId).not.toBe(runId);
    await waitForRun(retry.runId);
    expect((await getLatestRun(appId))?.status).toBe("done");
  });

  it("explains when a school has no verified research base and Claude is off", async () => {
    useStubs({ loadSchoolFacts: async () => [] });
    const appId = await newApplication();
    const { runId } = await startResearch(appId);
    await waitForRun(runId);
    const run = await getLatestRun(appId);
    expect(run?.status).toBe("failed");
    expect(run?.error).toBe(NO_RESEARCH_BASE_MESSAGE);
    expect((await getApplicationById(appId))?.error).toBe(NO_RESEARCH_BASE_MESSAGE);
  });

  it("recovers an application whose run was left running by a restarted server", async () => {
    useStubs();
    const appId = await newApplication();
    const db = await getDb();
    await db.insert(researchRuns).values({ id: "orphan-run", applicationId: appId, status: "running", startedAt: new Date(Date.now() - 60_000) });
    const { runId } = await startResearch(appId);
    expect(runId).not.toBe("orphan-run");
    const [orphan] = await db.select().from(researchRuns).where(eq(researchRuns.id, "orphan-run"));
    expect(orphan.status).toBe("failed");
    expect(orphan.error).toMatch(/interrupted/);
    await waitForRun(runId);
    expect((await getLatestRun(appId))?.status).toBe("done");
  });

  it("marks a run nobody is executing as interrupted, so viewers are not left waiting", async () => {
    const appId = await newApplication();
    const db = await getDb();
    await db.insert(researchRuns).values({ id: "stale-run", applicationId: appId, status: "running", startedAt: new Date() });
    const run = await getLatestRun(appId);
    const reconciled = await reconcileRun(run!);
    expect(reconciled).toMatchObject({ id: "stale-run", status: "failed", error: INTERRUPTED_MESSAGE });
    expect(await eventsOf("stale-run")).toEqual([{ type: "error", message: INTERRUPTED_MESSAGE }]);
    expect((await getApplicationById(appId))?.status).toBe("failed");
    // An active run is left alone.
    useStubs({}, 30);
    const { runId } = await startResearch(appId);
    const active = await getLatestRun(appId);
    expect(active?.id).toBe(runId);
    expect((await reconcileRun(active!)).status).toBe("running");
    await waitForRun(runId);
  });

  it("stops a run that exceeds its time limit and says so", async () => {
    let aborted = false;
    useStubs({
      buildDossier: (_input, hooks) =>
        new Promise((_, reject) => {
          hooks?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(hooks.signal?.reason);
          });
        }),
    });
    process.env.WHYUS_RUN_TIMEOUT_MS = "400";
    try {
      const appId = await newApplication();
      const { runId } = await startResearch(appId);
      await waitForRun(runId);
      const run = await getLatestRun(appId);
      expect(run?.status).toBe("failed");
      expect(run?.error).toMatch(/^Research took too long and was stopped/);
      expect(aborted).toBe(true);
      const events = await eventsOf(runId);
      expect(events[events.length - 1]).toMatchObject({ type: "error" });
    } finally {
      delete process.env.WHYUS_RUN_TIMEOUT_MS;
    }
  });
});
