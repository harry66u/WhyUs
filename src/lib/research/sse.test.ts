import { describe, expect, it } from "vitest";
import type { StoredResearchEvent } from "@/lib/types";
import { createResearchEventStream, formatSse, parseReplayCursor, type StreamRunInfo } from "./sse";

interface Message {
  id?: string;
  event?: string;
  data?: unknown;
  comment?: string;
  retry?: string;
}

function parse(text: string): Message[] {
  return text
    .split("\n\n")
    .filter((block) => block.trim())
    .map((block) => {
      const msg: Message = {};
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith(":")) msg.comment = line.slice(1).trim();
        else if (line.startsWith("id: ")) msg.id = line.slice(4);
        else if (line.startsWith("event: ")) msg.event = line.slice(7);
        else if (line.startsWith("retry: ")) msg.retry = line.slice(7);
        else if (line.startsWith("data: ")) data.push(line.slice(6));
      }
      if (data.length) msg.data = JSON.parse(data.join("\n"));
      return msg;
    });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

function stored(seq: number, message: string): StoredResearchEvent {
  return { seq, runId: "run-1", ts: new Date(1_700_000_000_000 + seq * 1000).toISOString(), event: { type: "log", message } };
}

function run(status: StreamRunInfo["status"]): StreamRunInfo {
  return { id: "run-1", status, startedAt: new Date(1_700_000_000_000).toISOString(), finishedAt: status === "running" ? null : new Date().toISOString(), error: null };
}

describe("research event stream", () => {
  it("replays stored events after the cursor in seq order, then ends with the run", async () => {
    const events = [stored(3, "c"), stored(1, "a"), stored(7, "d"), stored(2, "b")];
    const stream = createResearchEventStream({
      runId: "run-1",
      after: 1,
      loadEvents: async (_id, after) => events.filter((e) => e.seq > after).sort((a, b) => a.seq - b.seq),
      loadRun: async () => run("done"),
      pollMs: 5,
    });
    const messages = parse(await readAll(stream));
    expect(messages[0].retry).toBe("3000");
    expect(messages[1]).toMatchObject({ event: "run", data: { id: "run-1", status: "done" } });
    const research = messages.filter((m) => m.event === "research");
    expect(research.map((m) => m.id)).toEqual(["2", "3", "7"]);
    expect(research.map((m) => (m.data as StoredResearchEvent).event)).toEqual([
      { type: "log", message: "b" },
      { type: "log", message: "c" },
      { type: "log", message: "d" },
    ]);
    const replayedAt = messages.findIndex((m) => m.event === "replayed");
    expect(replayedAt).toBeGreaterThan(messages.findIndex((m) => m.id === "7"));
    expect(messages[messages.length - 1]).toMatchObject({ event: "end", data: { status: "done" } });
  });

  it("streams events stored while connected, without gaps or duplicates", async () => {
    const events: StoredResearchEvent[] = [stored(1, "one")];
    let status: StreamRunInfo["status"] = "running";
    const listeners = new Set<() => void>();
    const stream = createResearchEventStream({
      runId: "run-1",
      after: 0,
      loadEvents: async (_id, after) => events.filter((e) => e.seq > after),
      loadRun: async () => run(status),
      subscribe: (_id, listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      pollMs: 20,
      keepAliveMs: 30,
    });
    const reading = readAll(stream);
    for (let seq = 2; seq <= 6; seq++) {
      await new Promise((r) => setTimeout(r, 15));
      events.push(stored(seq, `event ${seq}`));
      for (const l of listeners) l();
    }
    await new Promise((r) => setTimeout(r, 60));
    events.push(stored(7, "last"));
    status = "done";
    const messages = parse(await reading);
    expect(messages.filter((m) => m.event === "research").map((m) => m.id)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(messages.some((m) => m.comment === "keep-alive")).toBe(true);
    expect(messages[messages.length - 1].event).toBe("end");
    expect(listeners.size).toBe(0);
  });

  it("ends immediately for a run that no longer exists", async () => {
    const stream = createResearchEventStream({ runId: "gone", after: 0, loadEvents: async () => [], loadRun: async () => null });
    const messages = parse(await readAll(stream));
    expect(messages[messages.length - 1]).toMatchObject({ event: "end", data: { status: "missing" } });
  });

  it("stops when the client goes away", async () => {
    const controller = new AbortController();
    const stream = createResearchEventStream({
      runId: "run-1",
      after: 0,
      loadEvents: async () => [],
      loadRun: async () => run("running"),
      pollMs: 10,
      signal: controller.signal,
    });
    const reading = readAll(stream);
    setTimeout(() => controller.abort(), 40);
    const messages = parse(await reading);
    expect(messages.some((m) => m.event === "end")).toBe(false);
  });

  it("resumes from the larger of ?after and Last-Event-ID", () => {
    expect(parseReplayCursor("5", null)).toBe(5);
    expect(parseReplayCursor(null, "12")).toBe(12);
    expect(parseReplayCursor("5", "12")).toBe(12);
    expect(parseReplayCursor("30", "12")).toBe(30);
    expect(parseReplayCursor("-3", "abc")).toBe(0);
    expect(parseReplayCursor(undefined, undefined)).toBe(0);
  });

  it("formats messages with one data line per payload", () => {
    expect(formatSse({ id: 4, event: "research", data: { a: "x\ny" } })).toBe('id: 4\nevent: research\ndata: {"a":"x\\ny"}\n\n');
  });
});
