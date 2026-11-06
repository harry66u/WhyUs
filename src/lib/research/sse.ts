/**
 * Server-sent events for the live research view.
 *
 * Wire format (one run per stream):
 *   retry: 3000                               reconnect delay hint
 *   event: run       data: RunInfo            first message (and again after a reconnect)
 *   id: <seq>  event: research  data: StoredResearchEvent   (oldest first)
 *   event: replayed  data: {seq}              stored events up to `seq` have been sent
 *   : keep-alive                              comment while idle
 *   event: end       data: {status, error}    the run finished; the client should close
 *
 * Replay starts after `?after=` or the `Last-Event-ID` header (whichever is
 * larger), so a reconnecting EventSource resumes exactly where it stopped.
 * New events arrive by polling the database (and immediately, when the run is
 * executing in this process, through an in-process notification).
 */
import type { StoredResearchEvent } from "@/lib/types";

export interface StreamRunInfo {
  id: string;
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface ResearchEventStreamOptions {
  runId: string;
  /** Replay events with seq greater than this. */
  after: number;
  loadEvents: (runId: string, afterSeq: number) => Promise<StoredResearchEvent[]>;
  loadRun: (runId: string) => Promise<StreamRunInfo | null>;
  /** Optional wake-up hook: call the listener when a new event was stored. */
  subscribe?: (runId: string, listener: () => void) => () => void;
  pollMs?: number;
  keepAliveMs?: number;
  /** Close the stream after this long even if the run is still going (the client reconnects). */
  maxDurationMs?: number;
  retryMs?: number;
  signal?: AbortSignal;
}

const encoder = new TextEncoder();

export function formatSse(message: { id?: number | string; event?: string; data?: unknown; retry?: number }): string {
  let out = "";
  if (message.retry !== undefined) out += `retry: ${message.retry}\n`;
  if (message.id !== undefined) out += `id: ${message.id}\n`;
  if (message.event) out += `event: ${message.event}\n`;
  if (message.data !== undefined) {
    const json = JSON.stringify(message.data);
    // JSON.stringify never emits raw newlines, but guard anyway: each line needs its own data: prefix.
    for (const line of json.split(/\r?\n/)) out += `data: ${line}\n`;
  }
  return `${out}\n`;
}

/** The replay cursor: the larger of `?after=` and `Last-Event-ID` (both optional, non-negative integers). */
export function parseReplayCursor(afterParam: string | null | undefined, lastEventId: string | null | undefined): number {
  const parse = (v: string | null | undefined) => {
    if (!v || !/^\d{1,15}$/.test(v.trim())) return 0;
    return Number.parseInt(v.trim(), 10);
  };
  return Math.max(parse(afterParam), parse(lastEventId));
}

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

export function createResearchEventStream(opts: ResearchEventStreamOptions): ReadableStream<Uint8Array> {
  const pollMs = opts.pollMs ?? 400;
  const keepAliveMs = opts.keepAliveMs ?? 15_000;
  const maxDurationMs = opts.maxDurationMs ?? 10 * 60 * 1000;
  let closed = false;
  let wake: (() => void) | null = null;
  let unsubscribe: (() => void) | null = null;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const finish = () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    unsubscribe = null;
    wake?.();
    opts.signal?.removeEventListener("abort", finish);
    try {
      controllerRef?.close();
    } catch {
      // already closed or cancelled
    }
  };

  const send = (chunk: string) => {
    if (closed || !controllerRef) return;
    try {
      controllerRef.enqueue(encoder.encode(chunk));
    } catch {
      finish();
    }
  };

  const nap = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wake = null;
        resolve();
      }, pollMs);
      wake = () => {
        clearTimeout(timer);
        wake = null;
        resolve();
      };
    });

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      if (opts.signal?.aborted) {
        finish();
        return;
      }
      opts.signal?.addEventListener("abort", finish, { once: true });
      unsubscribe = opts.subscribe?.(opts.runId, () => wake?.()) ?? null;

      void (async () => {
        let lastSeq = Math.max(0, opts.after);
        const startedAt = Date.now();
        let lastWrite = Date.now();
        const sendEvents = (events: StoredResearchEvent[]) => {
          for (const e of events) {
            if (e.seq <= lastSeq) continue;
            send(formatSse({ id: e.seq, event: "research", data: e }));
            lastSeq = e.seq;
            lastWrite = Date.now();
          }
        };
        try {
          send(formatSse({ retry: opts.retryMs ?? 3000 }));
          const run = await opts.loadRun(opts.runId);
          if (!run) {
            send(formatSse({ event: "end", data: { status: "missing", error: "This research run no longer exists." } }));
            finish();
            return;
          }
          send(formatSse({ event: "run", data: run }));

          let replayed = false;
          while (!closed) {
            sendEvents(await opts.loadEvents(opts.runId, lastSeq));
            if (!replayed) {
              replayed = true;
              send(formatSse({ event: "replayed", data: { seq: lastSeq } }));
            }
            const current = await opts.loadRun(opts.runId);
            if (!current || current.status !== "running") {
              // The run finished: send anything stored after the last read, then say so.
              sendEvents(await opts.loadEvents(opts.runId, lastSeq));
              send(
                formatSse({
                  event: "end",
                  data: { status: current?.status ?? "missing", error: current?.error ?? null, finishedAt: current?.finishedAt ?? null },
                }),
              );
              finish();
              return;
            }
            if (Date.now() - startedAt > maxDurationMs) {
              finish(); // the client reconnects with Last-Event-ID and resumes
              return;
            }
            if (Date.now() - lastWrite >= keepAliveMs) {
              send(": keep-alive\n\n");
              lastWrite = Date.now();
            }
            await nap();
          }
        } catch (err) {
          send(formatSse({ event: "stream-problem", data: { message: (err as Error)?.message ?? "Stream failed" } }));
          finish();
        }
      })();
    },
    cancel() {
      finish();
    },
  });
}
