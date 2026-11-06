/**
 * Research events: ordered persistence, in-process notification, and stage
 * bookkeeping.
 *
 * - Every event of a run is appended to research_events in the order it was
 *   emitted (a single serialized writer per run), so `seq` order is emission
 *   order and the live view can replay a run exactly.
 * - Writers notify in-process subscribers (the SSE endpoint) so live clients see
 *   an event as soon as it is stored instead of on the next poll.
 * - The registry lives on globalThis so it survives dev hot reloads.
 */
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { researchEvents } from "@/lib/db/schema";
import type { ResearchEvent, ResearchStage, StoredResearchEvent } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* In-process notification                                             */
/* ------------------------------------------------------------------ */

type Listener = () => void;

const g = globalThis as unknown as { __whyusResearchListeners?: Map<string, Set<Listener>> };

function listeners(): Map<string, Set<Listener>> {
  if (!g.__whyusResearchListeners) g.__whyusResearchListeners = new Map();
  return g.__whyusResearchListeners;
}

/** Called whenever a new event for `runId` has been stored. Returns an unsubscribe function. */
export function subscribeToRun(runId: string, listener: Listener): () => void {
  const map = listeners();
  let set = map.get(runId);
  if (!set) {
    set = new Set();
    map.set(runId, set);
  }
  set.add(listener);
  return () => {
    const current = map.get(runId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) map.delete(runId);
  };
}

export function notifyRun(runId: string): void {
  const set = listeners().get(runId);
  if (!set) return;
  for (const listener of [...set]) {
    try {
      listener();
    } catch {
      // a broken subscriber must not affect the run
    }
  }
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

/** Stored events of a run with seq greater than `afterSeq`, oldest first. */
export async function readRunEvents(runId: string, afterSeq = 0): Promise<StoredResearchEvent[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(researchEvents)
    .where(and(eq(researchEvents.runId, runId), gt(researchEvents.seq, Math.max(0, Math.floor(afterSeq) || 0))))
    .orderBy(asc(researchEvents.seq));
  return rows.map((r) => ({ seq: Number(r.seq), runId: r.runId, ts: r.ts.toISOString(), event: r.event }));
}

export interface RunEmitter {
  /** Queue an event; resolves once it is stored (never rejects). */
  emit(event: ResearchEvent): Promise<void>;
  /** Resolves when every queued event is stored. */
  flush(): Promise<void>;
  /** Stop accepting events (later emits are dropped). */
  close(): void;
  readonly closed: boolean;
}

/**
 * Serialized writer for one run: events are inserted one at a time in emit
 * order, each with the timestamp of the moment it was emitted.
 */
export function createRunEmitter(
  runId: string,
  opts: { onStored?: (event: ResearchEvent) => void; onError?: (err: unknown) => void } = {},
): RunEmitter {
  let chain: Promise<void> = Promise.resolve();
  let closed = false;
  let reportedError = false;
  return {
    get closed() {
      return closed;
    },
    emit(event: ResearchEvent): Promise<void> {
      if (closed) return Promise.resolve();
      const ts = new Date();
      chain = chain.then(async () => {
        try {
          const db = await getDb();
          await db.insert(researchEvents).values({ runId, ts, event });
          notifyRun(runId);
          opts.onStored?.(event);
        } catch (err) {
          // The run may have been deleted with its application; keep going quietly.
          if (!reportedError) {
            reportedError = true;
            opts.onError?.(err);
          }
        }
      });
      return chain;
    },
    flush(): Promise<void> {
      return chain;
    },
    close(): void {
      closed = true;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Stages                                                              */
/* ------------------------------------------------------------------ */

/** Application progress (0-100) when a stage starts and when it is done. */
export const STAGE_PROGRESS: Record<ResearchStage, { start: number; done: number }> = {
  scope: { start: 2, done: 4 },
  discover: { start: 5, done: 10 },
  read: { start: 11, done: 62 },
  verify: { start: 12, done: 66 },
  match: { start: 68, done: 80 },
  swap: { start: 81, done: 90 },
  assemble: { start: 91, done: 98 },
};

export interface StageTracker {
  start(stage: ResearchStage, detail?: string): Promise<void>;
  /** Marks a stage done (starting it first if needed). */
  done(stage: ResearchStage, detail?: string): Promise<void>;
  /** Pass-through for stage events produced elsewhere; drops duplicates. */
  observe(event: Extract<ResearchEvent, { type: "stage" }>): Promise<void>;
  isStarted(stage: ResearchStage): boolean;
  isDone(stage: ResearchStage): boolean;
}

/** Emits each stage's start and done exactly once, in a consistent order. */
export function createStageTracker(
  emit: (event: ResearchEvent) => Promise<void>,
  onChange?: (stage: ResearchStage, status: "start" | "done") => void,
): StageTracker {
  const started = new Set<ResearchStage>();
  const finished = new Set<ResearchStage>();
  const tracker: StageTracker = {
    async start(stage, detail) {
      if (started.has(stage)) return;
      started.add(stage);
      onChange?.(stage, "start");
      await emit({ type: "stage", stage, status: "start", ...(detail ? { detail } : {}) });
    },
    async done(stage, detail) {
      if (finished.has(stage)) return;
      if (!started.has(stage)) await tracker.start(stage);
      finished.add(stage);
      onChange?.(stage, "done");
      await emit({ type: "stage", stage, status: "done", ...(detail ? { detail } : {}) });
    },
    async observe(event) {
      if (event.status === "start") await tracker.start(event.stage, event.detail);
      else await tracker.done(event.stage, event.detail);
    },
    isStarted: (stage) => started.has(stage),
    isDone: (stage) => finished.has(stage),
  };
  return tracker;
}
