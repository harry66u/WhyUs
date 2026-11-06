"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { StoredResearchEvent } from "@/lib/types";
import { initResearchState, researchReducer, type RunMeta } from "./state";

export type ConnectionState = "idle" | "connecting" | "live" | "reconnecting" | "ended";

/**
 * Starts research when asked, follows the run's event stream, and keeps the
 * live view state. EventSource reconnects by itself (sending Last-Event-ID);
 * when the browser gives up, this reconnects with backoff from the last seq.
 */
export function useResearchRun(applicationId: string, initialRun: RunMeta | null) {
  const [state, dispatch] = useReducer(researchReducer, initialRun, initResearchState);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const lastSeq = useRef(0);
  const autoStarted = useRef(false);
  const followedRun = useRef<string | null>(initialRun?.id ?? null);
  useEffect(() => {
    followedRun.current = state.runId;
  }, [state.runId]);

  const start = useCallback(
    async (force: boolean) => {
      setStarting(true);
      setStartError(null);
      try {
        const res = await fetch(`/api/research/${encodeURIComponent(applicationId)}/start`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ force }),
        });
        const body = (await res.json().catch(() => null)) as { runId?: string; startedAt?: string | null; status?: RunMeta["status"]; error?: string } | null;
        if (!res.ok || !body?.runId) {
          throw new Error(body?.error ?? `Research could not be started (HTTP ${res.status}). Try again.`);
        }
        // Starting while a run is in progress returns that run: keep following it.
        if (body.runId === followedRun.current) return;
        followedRun.current = body.runId;
        lastSeq.current = 0;
        dispatch({
          type: "reset",
          runId: body.runId,
          run: body.startedAt ? { id: body.runId, status: body.status ?? "running", startedAt: body.startedAt, finishedAt: null, error: null } : null,
        });
        setConnection("connecting");
      } catch (err) {
        setStartError((err as Error).message || "Research could not be started. Try again.");
      } finally {
        setStarting(false);
      }
    },
    [applicationId],
  );

  // Start research once when the page opens for an application that has never been researched.
  useEffect(() => {
    if (initialRun || autoStarted.current) return;
    autoStarted.current = true;
    void start(false);
  }, [initialRun, start]);

  const runId = state.runId;
  useEffect(() => {
    if (!runId) return;
    let source: EventSource | null = null;
    let stopped = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let buffer: StoredResearchEvent[] = [];

    const flush = () => {
      flushTimer = undefined;
      if (buffer.length === 0) return;
      const events = buffer;
      buffer = [];
      dispatch({ type: "events", events });
    };

    const connect = () => {
      if (stopped) return;
      const url = `/api/research/${encodeURIComponent(applicationId)}/events?run=${encodeURIComponent(runId)}&after=${lastSeq.current}`;
      const es = new EventSource(url);
      source = es;
      es.addEventListener("open", () => {
        attempts = 0;
        setConnection("live");
      });
      es.addEventListener("run", (e) => {
        try {
          dispatch({ type: "run", run: JSON.parse((e as MessageEvent<string>).data) as RunMeta });
        } catch {
          // ignore a malformed message
        }
      });
      es.addEventListener("research", (e) => {
        try {
          const event = JSON.parse((e as MessageEvent<string>).data) as StoredResearchEvent;
          if (event.seq > lastSeq.current) lastSeq.current = event.seq;
          buffer.push(event);
          flushTimer ??= setTimeout(flush, 60);
        } catch {
          // ignore a malformed message
        }
      });
      es.addEventListener("replayed", () => {
        clearTimeout(flushTimer);
        flush();
        dispatch({ type: "replayed" });
      });
      es.addEventListener("end", (e) => {
        clearTimeout(flushTimer);
        flush();
        stopped = true;
        es.close();
        setConnection("ended");
        try {
          const data = JSON.parse((e as MessageEvent<string>).data) as { status: string; error?: string | null; finishedAt?: string | null };
          dispatch({ type: "ended", status: data.status, error: data.error, finishedAt: data.finishedAt });
        } catch {
          dispatch({ type: "ended", status: "done" });
        }
      });
      es.addEventListener("error", () => {
        if (stopped) return;
        if (es.readyState === EventSource.CLOSED) {
          // The browser gave up (for example the server refused the request): retry with backoff.
          es.close();
          attempts++;
          setConnection("reconnecting");
          retryTimer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4)));
        } else {
          setConnection("reconnecting"); // EventSource retries by itself with Last-Event-ID
        }
      });
    };

    connect();
    return () => {
      stopped = true;
      source?.close();
      clearTimeout(retryTimer);
      // Apply anything still buffered: the replay cursor has already moved past it.
      clearTimeout(flushTimer);
      flush();
    };
  }, [applicationId, runId]);

  return { state, connection, start, starting, startError };
}
