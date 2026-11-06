/**
 * Research runs: start, observe, and replay.
 *
 * CONTRACT (implemented by the research-runtime module):
 * - startResearch() creates a research_runs row, marks the application
 *   "researching", and runs the pipeline in the background (in-process). It
 *   returns immediately. Starting while a run is active returns that run.
 * - Every pipeline step appends ResearchEvents to research_events so the live
 *   view can stream them (and replay them after a reload).
 * - On success the dossier is saved, the application is marked "ready" with
 *   progress 100, and angles are re-coordinated across the student's dossiers.
 * - On failure the application is marked "failed" with a readable error.
 *
 * Runs execute in this process. The registry of active runs lives on globalThis
 * so it survives dev hot reloads; a run left "running" by a restarted process is
 * detected and marked failed the next time someone starts research for it.
 */
import { desc, eq } from "drizzle-orm";
import { getApplicationById, listApplicationsForStudent, setApplicationProgress, setApplicationStatus } from "@/lib/data/applications";
import { listLatestDossiersForStudent, saveDossier } from "@/lib/data/dossiers";
import { dbKind, getDb } from "@/lib/db/client";
import { researchRuns, students } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { llmAvailable } from "@/lib/llm/client";
import { buildDossier, coordinateAngles, rankFacts } from "@/lib/matching/engine";
import { getSchool } from "@/lib/schools/registry";
import type { ResearchEvent, StoredResearchEvent, StudentProfile } from "@/lib/types";
import { whenAborted } from "./async";
import { claudeFetchAvailable, readViaClaudeWebFetch } from "./claude-fetch";
import { getSchoolFacts, recordVerification, upsertFacts } from "./corpus-store";
import { crawlSchool } from "./crawler";
import { createRunEmitter, readRunEvents } from "./events";
import { getPageSource } from "./page-store";
import { ResearchError, runResearchPipeline, type PipelineApplication, type PipelineDeps } from "./pipeline";

export interface RunInfo {
  id: string;
  applicationId: string;
  status: "running" | "done" | "failed";
  engine: "llm" | "deterministic";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

/** A run that has not finished this long after it started is treated as abandoned (multi-process Postgres). */
const STALE_RUN_MS = 10 * 60 * 1000;
/** Hard limit for one run (WHYUS_RUN_TIMEOUT_MS); normal runs take about two minutes. */
function runTimeoutMs(): number {
  return Number(process.env.WHYUS_RUN_TIMEOUT_MS) || 5 * 60 * 1000;
}
/** Runs executing at once in this process (WHYUS_MAX_CONCURRENT_RUNS); more wait their turn as "queued". */
function maxConcurrentRuns(): number {
  return Math.max(1, Number(process.env.WHYUS_MAX_CONCURRENT_RUNS) || 8);
}

interface ActiveRun {
  runId: string;
  done: Promise<void>;
}

interface Registry {
  active: Map<string, ActiveRun>; // by application id
  starting: Map<string, Promise<{ runId: string }>>;
  running: number;
  waiting: (() => void)[];
  depsOverride: Partial<PipelineDeps> | null;
}

const g = globalThis as unknown as { __whyusResearchRuns?: Registry };

function registry(): Registry {
  if (!g.__whyusResearchRuns) {
    g.__whyusResearchRuns = { active: new Map(), starting: new Map(), running: 0, waiting: [], depsOverride: null };
  }
  return g.__whyusResearchRuns;
}

/* ------------------------------------------------------------------ */
/* Reading runs and events                                             */
/* ------------------------------------------------------------------ */

type RunRow = typeof researchRuns.$inferSelect;

function toRunInfo(r: RunRow): RunInfo {
  return {
    id: r.id,
    applicationId: r.applicationId,
    status: r.status,
    engine: r.engine,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    error: r.error ?? null,
  };
}

export async function getLatestRun(applicationId: string): Promise<RunInfo | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(researchRuns)
    .where(eq(researchRuns.applicationId, applicationId))
    .orderBy(desc(researchRuns.startedAt))
    .limit(1);
  return rows[0] ? toRunInfo(rows[0]) : null;
}

/** One run by id (callers check that it belongs to the application they authorized). */
export async function getRun(runId: string): Promise<RunInfo | null> {
  const db = await getDb();
  const rows = await db.select().from(researchRuns).where(eq(researchRuns.id, runId)).limit(1);
  return rows[0] ? toRunInfo(rows[0]) : null;
}

export async function getRunEvents(runId: string, afterSeq = 0): Promise<StoredResearchEvent[]> {
  return readRunEvents(runId, afterSeq);
}

/** Resolves when the application's active run (if any) has finished. Never rejects. */
export function waitForRun(runId: string): Promise<void> {
  for (const active of registry().active.values()) if (active.runId === runId) return active.done;
  return Promise.resolve();
}

export const INTERRUPTED_MESSAGE = "Research was interrupted before it finished because the server restarted. Start it again.";

/**
 * A run marked "running" that no process is executing (the server restarted,
 * or it has run far longer than any run can) is marked failed, with an error
 * event, so viewers see that it stopped instead of waiting for it.
 */
export async function reconcileRun(run: RunInfo, opts: { starting?: boolean } = {}): Promise<RunInfo> {
  if (run.status !== "running") return run;
  const reg = registry();
  if (reg.active.get(run.applicationId)?.runId === run.id) return run;
  if (!opts.starting && reg.starting.has(run.applicationId)) return run;
  const abandoned = dbKind() === "pglite" || Date.now() - Date.parse(run.startedAt) > STALE_RUN_MS;
  if (!abandoned) return run;
  const emitter = createRunEmitter(run.id);
  await emitter.emit({ type: "error", message: INTERRUPTED_MESSAGE });
  await emitter.flush();
  await finishRun(run.id, "failed", INTERRUPTED_MESSAGE);
  const latest = await getLatestRun(run.applicationId);
  if (latest?.id === run.id) await setApplicationStatus(run.applicationId, "failed", undefined, INTERRUPTED_MESSAGE);
  return { ...run, status: "failed", error: INTERRUPTED_MESSAGE, finishedAt: new Date().toISOString() };
}

/* ------------------------------------------------------------------ */
/* Starting runs                                                       */
/* ------------------------------------------------------------------ */

/**
 * Start research for an application. Returns the active run when one is in
 * progress. Without `force`, an application whose latest run completed keeps
 * that run; a failed or interrupted run is retried.
 */
export async function startResearch(applicationId: string, opts: { force?: boolean } = {}): Promise<{ runId: string }> {
  const reg = registry();
  const active = reg.active.get(applicationId);
  if (active) return { runId: active.runId };
  const pending = reg.starting.get(applicationId);
  if (pending) return pending;

  const p = (async () => {
    const app = await getApplicationById(applicationId);
    if (!app) throw new Error(`Application not found: ${applicationId}`);
    const found = await getLatestRun(applicationId);
    const latest = found ? await reconcileRun(found, { starting: true }) : null;
    if (latest?.status === "running") return { runId: latest.id };
    if (latest?.status === "done" && !opts.force) return { runId: latest.id };

    const runId = newId();
    const db = await getDb();
    await db.insert(researchRuns).values({
      id: runId,
      applicationId,
      status: "running",
      engine: llmAvailable() ? "llm" : "deterministic",
      startedAt: new Date(),
    });
    await setApplicationStatus(applicationId, "queued", 0, null);
    const done = executeRun(runId, app).catch((err) => {
      console.error(`[research] run ${runId} crashed outside the pipeline`, err);
    });
    reg.active.set(applicationId, { runId, done });
    void done.finally(() => {
      if (reg.active.get(applicationId)?.runId === runId) reg.active.delete(applicationId);
    });
    return { runId };
  })().finally(() => reg.starting.delete(applicationId));
  reg.starting.set(applicationId, p);
  return p;
}

/* ------------------------------------------------------------------ */
/* Executing runs                                                      */
/* ------------------------------------------------------------------ */

async function acquireSlot(onWait: () => Promise<void>): Promise<() => void> {
  const reg = registry();
  if (reg.running >= maxConcurrentRuns()) {
    await onWait();
    while (reg.running >= maxConcurrentRuns()) await new Promise<void>((resolve) => reg.waiting.push(resolve));
  }
  reg.running++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    reg.running--;
    reg.waiting.shift()?.();
  };
}

async function finishRun(runId: string, status: "done" | "failed", error: string | null): Promise<void> {
  const db = await getDb();
  await db.update(researchRuns).set({ status, error, finishedAt: new Date() }).where(eq(researchRuns.id, runId));
}

function readableError(err: unknown): string {
  if (err instanceof ResearchError) return err.message;
  const message = err instanceof Error ? err.message : String(err ?? "unknown error");
  return `Research stopped because of an unexpected problem (${message.slice(0, 240)}). Try again; if it keeps happening, the school may need a research update.`;
}

function createProgressReporter(applicationId: string): (p: number) => void {
  let written = 0;
  let chain: Promise<void> = Promise.resolve();
  return (p: number) => {
    const value = Math.max(0, Math.min(99, Math.round(p)));
    if (value <= written) return;
    written = value;
    chain = chain.then(() => setApplicationProgress(applicationId, value)).catch(() => {});
  };
}

async function loadStudent(studentId: string): Promise<StudentProfile | null> {
  const db = await getDb();
  const [row] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    graduationYear: row.graduationYear,
    highSchool: row.highSchool ?? undefined,
    location: row.location ?? undefined,
    intendedMajors: row.intendedMajors ?? [],
    interests: row.interests ?? [],
    activities: row.activities ?? [],
  };
}

function defaultDeps(): PipelineDeps {
  return {
    getSchool,
    loadStudent,
    listStudentApplications: (studentId) => listApplicationsForStudent(studentId),
    loadSchoolFacts: (schoolId, unitId) => getSchoolFacts(schoolId, { unitId }),
    pageSource: getPageSource(),
    recordVerification,
    upsertFacts,
    rankFacts,
    buildDossier,
    coordinateAngles,
    saveDossier,
    listStudentDossiers: listLatestDossiersForStudent,
    llmAvailable,
    crawlSchool,
    claudeFetch: claudeFetchAvailable() ? readViaClaudeWebFetch : null,
    newId: () => newId(),
    now: () => Date.now(),
  };
}

/**
 * Replace pipeline dependencies (tests and scripts, e.g. a stubbed page source
 * or matching engine). Pass null to restore the defaults.
 */
export function overrideResearchDeps(overrides: Partial<PipelineDeps> | null): void {
  registry().depsOverride = overrides;
}

async function executeRun(runId: string, app: PipelineApplication): Promise<void> {
  const emitter = createRunEmitter(runId, {
    onError: (err) => console.error(`[research] could not store events for run ${runId}`, err),
  });
  const emit = (event: ResearchEvent) => emitter.emit(event);
  // Events from the pipeline stop the moment the run is settled, so a pipeline
  // that is still unwinding after a timeout cannot write after the final event.
  let pipelineOpen = true;
  const pipelineEmit = (event: ResearchEvent) => (pipelineOpen ? emitter.emit(event) : Promise.resolve());
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new ResearchError("Research took too long and was stopped. Some school sites may be slow right now; try again in a few minutes.", "timeout"),
      ),
    runTimeoutMs(),
  );
  let release: (() => void) | null = null;
  try {
    release = await acquireSlot(() => emit({ type: "log", message: "Waiting for other research runs on this server to finish." }));
    await setApplicationStatus(app.id, "researching", 1, null);
    const deps: PipelineDeps = { ...defaultDeps(), ...(registry().depsOverride ?? {}) };
    const onProgress = createProgressReporter(app.id);
    const { dossier } = await Promise.race([
      runResearchPipeline(app, deps, { emit: pipelineEmit, onProgress, signal: controller.signal }),
      whenAborted(controller.signal),
    ]);
    pipelineOpen = false;
    await emit({ type: "done", dossierId: dossier.id, uniquenessScore: Math.round(dossier.uniquenessScore) });
    await emitter.flush();
    emitter.close();
    await finishRun(runId, "done", null);
    await setApplicationStatus(app.id, "ready", 100, null);
  } catch (err) {
    pipelineOpen = false;
    const message = readableError(err);
    if (!(err instanceof ResearchError)) console.error(`[research] run ${runId} failed`, err);
    if (!controller.signal.aborted) controller.abort(err);
    await emit({ type: "error", message });
    await emitter.flush();
    emitter.close();
    await finishRun(runId, "failed", message).catch(() => {});
    await setApplicationStatus(app.id, "failed", undefined, message).catch(() => {});
  } finally {
    clearTimeout(timer);
    release?.();
  }
}

export type { ResearchEvent };
