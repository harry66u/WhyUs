/**
 * Live research view state: a pure reducer over stored research events.
 *
 * Events are applied in seq order and at most once, so a replay after a
 * reconnect (or a reload) produces exactly the same state as watching live.
 * Page events for the same URL are merged into one log line whose status
 * moves from reading to read, cached, blocked, or failed.
 */
import {
  RESEARCH_STAGES,
  type Commonness,
  type FactKind,
  type PageStatus,
  type ResearchStage,
  type StoredResearchEvent,
  type SwapStatus,
} from "@/lib/types";

export type StageStatus = "pending" | "active" | "done" | "failed";

export interface StageState {
  stage: ResearchStage;
  label: string;
  index: number; // 1-based
  status: StageStatus;
  detail?: string;
}

interface EntryBase {
  key: string;
  seq: number;
  ts: string;
  /** False for events that arrived in the initial replay (rendered without an entrance animation). */
  live: boolean;
}

export type LogEntry =
  | (EntryBase & { kind: "stage"; stage: ResearchStage; index: number; label: string; status: "start" | "done"; detail?: string })
  | (EntryBase & { kind: "page"; url: string; host: string; path: string; title?: string; status: PageStatus; reason?: string; ms?: number })
  | (EntryBase & {
      kind: "fact";
      factId: string;
      title: string;
      factKind: FactKind;
      url: string;
      host: string;
      status: "verified" | "rejected";
      quote?: string;
      reason?: string;
    })
  | (EntryBase & { kind: "match"; factId: string; title: string; activityTitle?: string; score: number; sentence: string })
  | (EntryBase & { kind: "swap"; factId: string; title: string; results: SwapEntry[] })
  | (EntryBase & { kind: "angle"; line: string; isLead: boolean })
  | (EntryBase & { kind: "log"; message: string })
  | (EntryBase & { kind: "done"; dossierId: string; uniquenessScore: number })
  | (EntryBase & { kind: "error"; message: string });

export interface SwapEntry {
  schoolId: string;
  schoolName: string;
  status: SwapStatus;
  equivalentTitle?: string;
}

export interface FactInfo {
  factId: string;
  title: string;
  kind: FactKind;
  url: string;
  status: "verified" | "rejected";
  quote?: string;
  commonness?: Commonness;
}

export interface MatchInfo {
  factId: string;
  title: string;
  activityTitle?: string;
  score: number;
  sentence: string;
  seq: number;
}

export interface RunMeta {
  id: string;
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface Counters {
  pagesRead: number;
  pagesBlocked: number;
  factsVerified: number;
  factsRejected: number;
  matches: number;
}

export interface ResearchViewState {
  runId: string | null;
  run: RunMeta | null;
  lastSeq: number;
  /** True once the initial replay finished; later events animate and are announced. */
  live: boolean;
  entries: LogEntry[];
  pageEntry: Record<string, number>; // url -> index in entries
  pageStatus: Record<string, PageStatus>;
  stages: StageState[];
  facts: Record<string, FactInfo>;
  matches: Record<string, MatchInfo>;
  swaps: Record<string, SwapEntry[]>;
  angles: { line: string; isLead: boolean; seq: number }[];
  counters: Counters;
  done: { dossierId: string; uniquenessScore: number } | null;
  error: string | null;
  ended: boolean;
  announcement: string;
}

export type ResearchAction =
  | { type: "reset"; runId: string | null; run?: RunMeta | null }
  | { type: "run"; run: RunMeta }
  | { type: "events"; events: StoredResearchEvent[] }
  | { type: "replayed" }
  | { type: "ended"; status: string; error?: string | null; finishedAt?: string | null };

function initialStages(): StageState[] {
  return RESEARCH_STAGES.map((s, i) => ({ stage: s.stage, label: s.label, index: i + 1, status: "pending" }));
}

export function initResearchState(run: RunMeta | null): ResearchViewState {
  return {
    runId: run?.id ?? null,
    run,
    lastSeq: 0,
    live: false,
    entries: [],
    pageEntry: {},
    pageStatus: {},
    stages: initialStages(),
    facts: {},
    matches: {},
    swaps: {},
    angles: [],
    counters: { pagesRead: 0, pagesBlocked: 0, factsVerified: 0, factsRejected: 0, matches: 0 },
    done: null,
    error: run?.status === "failed" ? run.error : null,
    ended: false,
    announcement: "",
  };
}

function splitUrl(url: string): { host: string; path: string } {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(`${u.pathname}${u.search}`);
    return { host: u.host.replace(/^www\./, ""), path: path === "/" ? "/" : path.replace(/\/$/, "") };
  } catch {
    return { host: url, path: "" };
  }
}

function countPages(status: Record<string, PageStatus>): { read: number; blocked: number } {
  let read = 0;
  let blocked = 0;
  for (const s of Object.values(status)) {
    if (s === "read" || s === "cached") read++;
    else if (s === "blocked" || s === "failed") blocked++;
  }
  return { read, blocked };
}

function countFacts(facts: Record<string, FactInfo>): { verified: number; rejected: number } {
  let verified = 0;
  let rejected = 0;
  for (const f of Object.values(facts)) {
    if (f.status === "verified") verified++;
    else rejected++;
  }
  return { verified, rejected };
}

/** Applies events (already sorted or not) to the state, skipping any seen before. */
function applyEvents(state: ResearchViewState, events: StoredResearchEvent[]): ResearchViewState {
  const fresh = events
    .filter((e) => e && e.seq > state.lastSeq && (!state.runId || e.runId === state.runId))
    .sort((a, b) => a.seq - b.seq);
  if (fresh.length === 0) return state;

  const entries = [...state.entries];
  const pageEntry = { ...state.pageEntry };
  const pageStatus = { ...state.pageStatus };
  const stages = state.stages.map((s) => ({ ...s }));
  const facts = { ...state.facts };
  const matches = { ...state.matches };
  const swaps = { ...state.swaps };
  let angles = state.angles;
  let done = state.done;
  let error = state.error;
  let announcement = state.announcement;
  let lastSeq = state.lastSeq;
  const live = state.live;

  for (const stored of fresh) {
    if (stored.seq <= lastSeq) continue;
    lastSeq = stored.seq;
    const base = { seq: stored.seq, ts: stored.ts, live };
    const ev = stored.event;
    switch (ev.type) {
      case "stage": {
        const st = stages.find((s) => s.stage === ev.stage);
        if (!st) break;
        if (ev.status === "start") {
          if (st.status === "pending") st.status = "active";
          if (ev.detail) st.detail = ev.detail;
        } else {
          st.status = "done";
          if (ev.detail) st.detail = ev.detail;
        }
        entries.push({ ...base, key: `s${stored.seq}`, kind: "stage", stage: ev.stage, index: st.index, label: st.label, status: ev.status, detail: ev.detail });
        if (live) announcement = ev.status === "start" ? `${st.label} started.` : `${st.label} done.${ev.detail ? ` ${ev.detail}` : ""}`;
        break;
      }
      case "page": {
        const { host, path } = splitUrl(ev.url);
        const existing = pageEntry[ev.url];
        if (existing !== undefined && entries[existing]?.kind === "page") {
          const prev = entries[existing] as Extract<LogEntry, { kind: "page" }>;
          entries[existing] = {
            ...prev,
            status: ev.status,
            title: ev.title ?? prev.title,
            reason: ev.reason ?? (ev.status === "reading" ? prev.reason : undefined),
            ms: ev.ms ?? prev.ms,
          };
        } else {
          pageEntry[ev.url] = entries.length;
          entries.push({ ...base, key: `p${stored.seq}`, kind: "page", url: ev.url, host, path, title: ev.title, status: ev.status, reason: ev.reason, ms: ev.ms });
        }
        pageStatus[ev.url] = ev.status;
        break;
      }
      case "fact": {
        facts[ev.factId] = {
          factId: ev.factId,
          title: ev.title,
          kind: ev.kind,
          url: ev.url,
          status: ev.status,
          quote: ev.quote,
          commonness: ev.commonness ?? facts[ev.factId]?.commonness,
        };
        entries.push({
          ...base,
          key: `f${stored.seq}`,
          kind: "fact",
          factId: ev.factId,
          title: ev.title,
          factKind: ev.kind,
          url: ev.url,
          host: splitUrl(ev.url).host,
          status: ev.status,
          quote: ev.quote,
          reason: ev.reason,
        });
        break;
      }
      case "match": {
        matches[ev.factId] = { factId: ev.factId, title: ev.title, activityTitle: ev.activityTitle, score: ev.score, sentence: ev.sentence, seq: stored.seq };
        entries.push({ ...base, key: `m${stored.seq}`, kind: "match", factId: ev.factId, title: ev.title, activityTitle: ev.activityTitle, score: ev.score, sentence: ev.sentence });
        break;
      }
      case "swap": {
        swaps[ev.factId] = ev.results;
        entries.push({ ...base, key: `w${stored.seq}`, kind: "swap", factId: ev.factId, title: ev.title, results: ev.results });
        break;
      }
      case "angle": {
        // One entry per line; a new lead (also after re-coordination) goes first and demotes the old one.
        const rest = angles.filter((a) => a.line !== ev.line).map((a) => (ev.isLead ? { ...a, isLead: false } : a));
        angles = ev.isLead ? [{ line: ev.line, isLead: true, seq: stored.seq }, ...rest] : [...rest, { line: ev.line, isLead: false, seq: stored.seq }];
        entries.push({ ...base, key: `a${stored.seq}`, kind: "angle", line: ev.line, isLead: ev.isLead });
        break;
      }
      case "log":
        entries.push({ ...base, key: `l${stored.seq}`, kind: "log", message: ev.message });
        break;
      case "done":
        done = { dossierId: ev.dossierId, uniquenessScore: ev.uniquenessScore };
        for (const s of stages) if (s.status !== "done") s.status = "done";
        entries.push({ ...base, key: `d${stored.seq}`, kind: "done", dossierId: ev.dossierId, uniquenessScore: ev.uniquenessScore });
        if (live) announcement = `Dossier ready. Uniqueness ${ev.uniquenessScore}.`;
        break;
      case "error":
        error = ev.message;
        for (const s of stages) if (s.status === "active") s.status = "failed";
        entries.push({ ...base, key: `e${stored.seq}`, kind: "error", message: ev.message });
        if (live) announcement = `Research stopped. ${ev.message}`;
        break;
    }
  }

  const pages = countPages(pageStatus);
  const factCounts = countFacts(facts);
  return {
    ...state,
    lastSeq,
    entries,
    pageEntry,
    pageStatus,
    stages,
    facts,
    matches,
    swaps,
    angles,
    done,
    error,
    announcement,
    counters: {
      pagesRead: pages.read,
      pagesBlocked: pages.blocked,
      factsVerified: factCounts.verified,
      factsRejected: factCounts.rejected,
      matches: Object.keys(matches).length,
    },
  };
}

export function researchReducer(state: ResearchViewState, action: ResearchAction): ResearchViewState {
  switch (action.type) {
    case "reset":
      return { ...initResearchState(action.run ?? null), runId: action.runId };
    case "run":
      if (state.runId && action.run.id !== state.runId) return state;
      return { ...state, runId: action.run.id, run: action.run, error: action.run.status === "failed" ? (action.run.error ?? state.error) : state.error };
    case "events":
      return applyEvents(state, action.events);
    case "replayed":
      return state.live ? state : { ...state, live: true };
    case "ended": {
      const status = action.status === "done" || action.status === "failed" ? action.status : (state.run?.status ?? "failed");
      const run = state.run ? { ...state.run, status, finishedAt: action.finishedAt ?? state.run.finishedAt, error: action.error ?? state.run.error } : state.run;
      const error = status === "failed" ? (state.error ?? action.error ?? "Research stopped before it finished.") : state.error;
      const stages = status === "failed" ? state.stages.map((s) => (s.status === "active" ? { ...s, status: "failed" as const } : s)) : state.stages;
      return { ...state, run, error, stages, ended: true };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export function currentStage(stages: StageState[]): StageState | null {
  const active = [...stages].reverse().find((s) => s.status === "active" || s.status === "failed");
  if (active) return active;
  const firstPending = stages.find((s) => s.status === "pending");
  if (firstPending && stages.some((s) => s.status === "done")) return firstPending;
  return stages.every((s) => s.status === "done") ? stages[stages.length - 1] : null;
}

/**
 * Uniqueness estimate while the dossier is forming, from how often applicants
 * cite the detail and the swap test results so far. The final dossier carries
 * the engine's own scores.
 */
export function provisionalUniqueness(commonness: Commonness | undefined, swap: SwapEntry[] | undefined): number {
  let score = commonness === "common" ? 28 : commonness === "rare" ? 80 : 56;
  const known = (swap ?? []).filter((s) => s.status !== "unknown");
  if (known.length) {
    const share = known.reduce((n, s) => n + (s.status === "none" ? 1 : s.status === "similar" ? 0.45 : 0), 0) / known.length;
    score = score * 0.55 + share * 100 * 0.45;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export interface FormingItem {
  factId: string;
  title: string;
  kind?: FactKind;
  activityTitle?: string;
  sentence: string;
  score: number;
  uniqueness: number;
  commonness?: Commonness;
  swap?: SwapEntry[];
}

/** Matched details ranked by how directly they fit, best first. */
export function formingItems(state: Pick<ResearchViewState, "matches" | "facts" | "swaps">, limit = 8): FormingItem[] {
  return Object.values(state.matches)
    .sort((a, b) => b.score - a.score || a.seq - b.seq)
    .slice(0, limit)
    .map((m) => {
      const fact = state.facts[m.factId];
      const swap = state.swaps[m.factId];
      return {
        factId: m.factId,
        title: m.title || fact?.title || "Untitled detail",
        kind: fact?.kind,
        activityTitle: m.activityTitle,
        sentence: m.sentence,
        score: m.score,
        uniqueness: provisionalUniqueness(fact?.commonness, swap),
        commonness: fact?.commonness,
        swap,
      };
    });
}

/** "No equivalent at Penn and Tufts; similar at Cornell." */
export function swapSummary(results: SwapEntry[] | undefined): string {
  if (!results?.length) return "";
  const group = (status: SwapStatus) => results.filter((r) => r.status === status).map((r) => r.schoolName);
  const join = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`);
  const parts: string[] = [];
  const none = group("none");
  const similar = group("similar");
  const equivalent = group("equivalent");
  const unknown = group("unknown");
  if (none.length) parts.push(`no equivalent at ${join(none)}`);
  if (similar.length) parts.push(`similar at ${join(similar)}`);
  if (equivalent.length) parts.push(`equivalent at ${join(equivalent)}`);
  if (unknown.length) parts.push(`not yet researched at ${join(unknown)}`);
  const text = parts.join("; ");
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : "";
}

/** "00:12" from the run start. */
export function offsetLabel(startIso: string | undefined, tsIso: string): string {
  if (!startIso) return "";
  const ms = Math.max(0, Date.parse(tsIso) - Date.parse(startIso));
  if (!Number.isFinite(ms)) return "";
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
