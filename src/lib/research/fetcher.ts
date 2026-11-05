/**
 * Polite fetcher for official school pages.
 *
 * - Identifies itself honestly (WhyUsResearchBot) and respects robots.txt.
 * - Uses standard TLS certificate validation; never weakens it. Hosts whose
 *   certificates cannot be validated are reported as unreachable.
 * - Never attempts to get past bot challenges. A challenge page is reported as
 *   "blocked" so the research view can say so plainly.
 * - Limits concurrency per host and overall, and spaces requests to one host.
 * - Follows redirects manually so every hop can be checked against the
 *   caller's official-host policy.
 */
import { Agent, EnvHttpProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import { isAllowed, parseRobots, type RobotsPolicy } from "./robots";

export const BOT_PRODUCT_TOKEN = "WhyUsResearchBot";
const DEFAULT_UA = `${BOT_PRODUCT_TOKEN}/1.0 (college research tool; verifies facts on official school pages; respects robots.txt)`;

export function botUserAgent(): string {
  return process.env.WHYUS_BOT_UA || DEFAULT_UA;
}

export type BlockedReason =
  | "robots"
  | "bot-challenge"
  | "tls"
  | "off-domain-redirect"
  | "not-official"
  | "too-many-redirects"
  | "unsupported-content"
  | "too-large";

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number; // 0 when no HTTP response was received
  ok: boolean;
  contentType: string | null;
  body: string | null; // decoded text (HTML / plain text), or extracted PDF text
  isPdf: boolean;
  ms: number;
  fetchedAt: string;
  blockedReason?: BlockedReason;
  error?: string;
}

export interface FetchOptions {
  /** Return false to refuse a URL (initial or redirect target) as not official. */
  isAllowedUrl?: (url: URL) => boolean;
  timeoutMs?: number;
  maxBytes?: number;
  /** Skip robots.txt (only used to fetch robots.txt itself). */
  skipRobots?: boolean;
  signal?: AbortSignal;
}

const MAX_REDIRECTS = 5;
const PER_HOST_CONCURRENCY = 2;
const GLOBAL_CONCURRENCY = 8;
const MIN_HOST_INTERVAL_MS = 350;
const ROBOTS_TTL_MS = 6 * 60 * 60 * 1000;

let dispatcher: Dispatcher | undefined;
function getDispatcher(): Dispatcher {
  if (!dispatcher) {
    const proxied = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);
    dispatcher = proxied
      ? new EnvHttpProxyAgent({ connectTimeout: 15_000 })
      : new Agent({ connect: { timeout: 15_000 }, keepAliveTimeout: 10_000 });
  }
  return dispatcher;
}

/* ------------------------------------------------------------------ */
/* Concurrency control                                                  */
/* ------------------------------------------------------------------ */

interface HostSlot {
  active: number;
  nextStart: number;
  waiters: (() => void)[];
}
const hosts = new Map<string, HostSlot>();
let globalActive = 0;
const globalWaiters: (() => void)[] = [];

async function acquire(host: string, minIntervalMs: number): Promise<() => void> {
  while (globalActive >= GLOBAL_CONCURRENCY) await new Promise<void>((r) => globalWaiters.push(r));
  globalActive++;
  let slot = hosts.get(host);
  if (!slot) {
    slot = { active: 0, nextStart: 0, waiters: [] };
    hosts.set(host, slot);
  }
  while (slot.active >= PER_HOST_CONCURRENCY) await new Promise<void>((r) => slot!.waiters.push(r));
  slot.active++;
  const wait = slot.nextStart - Date.now();
  slot.nextStart = Math.max(Date.now(), slot.nextStart) + minIntervalMs;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    slot!.active--;
    slot!.waiters.shift()?.();
    globalActive--;
    globalWaiters.shift()?.();
  };
}

/* ------------------------------------------------------------------ */
/* robots.txt                                                           */
/* ------------------------------------------------------------------ */

interface RobotsEntry {
  policy: RobotsPolicy | "disallow-all";
  /** Set when robots.txt itself could not be fetched (RFC 9309 "unreachable"). */
  unreachable?: { reason?: BlockedReason; detail: string };
  expires: number;
}
const robotsCache = new Map<string, RobotsEntry>();
const ALLOW_ALL: RobotsPolicy = { rules: [], crawlDelayMs: null, sitemaps: [] };

async function robotsFor(origin: string): Promise<RobotsEntry> {
  const cached = robotsCache.get(origin);
  if (cached && cached.expires > Date.now()) return cached;
  let entry: RobotsEntry;
  const res = await fetchRaw(`${origin}/robots.txt`, { skipRobots: true, timeoutMs: 10_000, maxBytes: 512_000 });
  const expires = Date.now() + ROBOTS_TTL_MS;
  if (res.status >= 200 && res.status < 300 && res.body !== null && !res.blockedReason) {
    entry = { policy: parseRobots(res.body, BOT_PRODUCT_TOKEN), expires };
  } else if (res.status >= 400 && res.status < 500 && !res.blockedReason) {
    entry = { policy: ALLOW_ALL, expires }; // RFC 9309: robots.txt unavailable -> allow
  } else if (res.status >= 300 && res.status < 400) {
    entry = { policy: ALLOW_ALL, expires };
  } else {
    // RFC 9309: robots.txt unreachable (network, TLS, 5xx, challenge) -> assume complete disallow.
    entry = {
      policy: "disallow-all",
      unreachable: { reason: res.blockedReason, detail: describeBlocked(res) },
      expires: Date.now() + 15 * 60 * 1000,
    };
  }
  robotsCache.set(origin, entry);
  return entry;
}

export async function getRobotsPolicy(origin: string): Promise<RobotsPolicy | "disallow-all"> {
  return (await robotsFor(origin)).policy;
}

/* ------------------------------------------------------------------ */
/* Fetching                                                             */
/* ------------------------------------------------------------------ */

function isChallenge(status: number, headers: Headers, body: string | null): boolean {
  if (headers.get("cf-mitigated") === "challenge") return true;
  if (![403, 429, 503].includes(status)) return false;
  const b = (body ?? "").slice(0, 20_000);
  return /Just a moment\.\.\.|challenge-platform|cf-chl|Attention Required!|captcha|Access denied|Request unsuccessful\. Incapsula|perimeterx|px-captcha/i.test(
    b,
  );
}

function tlsError(err: unknown): boolean {
  const code = (err as { cause?: { code?: string } })?.cause?.code ?? (err as { code?: string })?.code ?? "";
  return /CERT|SSL|TLS|UNABLE_TO_VERIFY|SELF_SIGNED|DEPTH_ZERO|ERR_TLS/i.test(String(code));
}

async function readBody(res: Response, maxBytes: number): Promise<{ text: string | null; bytes: Uint8Array | null; tooLarge: boolean }> {
  if (!res.body) return { text: "", bytes: new Uint8Array(), tooLarge: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { text: null, bytes: null, tooLarge: true };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  const charset = /charset=([^;]+)/i.exec(res.headers.get("content-type") ?? "")?.[1]?.trim().toLowerCase();
  let text: string;
  try {
    text = new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8").decode(bytes);
  } catch {
    text = new TextDecoder("utf-8").decode(bytes);
  }
  return { text, bytes, tooLarge: false };
}

async function pdfToText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

/** Low-level fetch: no robots check, manual redirects, size/time limits. */
async function fetchRaw(input: string, opts: FetchOptions): Promise<FetchResult> {
  const started = Date.now();
  const fetchedAt = new Date().toISOString();
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxBytes = opts.maxBytes ?? 6_000_000;
  let current = new URL(input);
  const base: Omit<FetchResult, "finalUrl" | "status" | "ok" | "contentType" | "body" | "isPdf" | "ms"> = {
    url: input,
    fetchedAt,
  };

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (opts.isAllowedUrl && !opts.isAllowedUrl(current)) {
      return {
        ...base,
        finalUrl: current.toString(),
        status: 0,
        ok: false,
        contentType: null,
        body: null,
        isPdf: false,
        ms: Date.now() - started,
        blockedReason: hop === 0 ? "not-official" : "off-domain-redirect",
      };
    }
    const release = await acquire(current.host, MIN_HOST_INTERVAL_MS);
    let res: Response;
    try {
      const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
      res = (await undiciFetch(current, {
        dispatcher: getDispatcher(),
        redirect: "manual",
        signal,
        headers: {
          "user-agent": botUserAgent(),
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,application/pdf;q=0.8,*/*;q=0.5",
          "accept-language": "en-US,en;q=0.8",
        },
      })) as unknown as Response;
    } catch (err) {
      release();
      return {
        ...base,
        finalUrl: current.toString(),
        status: 0,
        ok: false,
        contentType: null,
        body: null,
        isPdf: false,
        ms: Date.now() - started,
        blockedReason: tlsError(err) ? "tls" : undefined,
        error: tlsError(err)
          ? "TLS certificate could not be validated"
          : ((err as Error)?.name === "TimeoutError" ? "Timed out" : ((err as { cause?: { code?: string } })?.cause?.code ?? (err as Error)?.message ?? "Network error")),
      };
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      release();
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
      current = new URL(res.headers.get("location")!, current);
      continue;
    }

    try {
      const contentType = res.headers.get("content-type");
      const isPdf = /application\/pdf/i.test(contentType ?? "") || current.pathname.toLowerCase().endsWith(".pdf");
      const isText = /text\/|application\/(xhtml\+xml|xml|json)/i.test(contentType ?? "text/html");
      if (!isPdf && !isText) {
        await res.body?.cancel();
        return {
          ...base,
          finalUrl: current.toString(),
          status: res.status,
          ok: false,
          contentType,
          body: null,
          isPdf: false,
          ms: Date.now() - started,
          blockedReason: "unsupported-content",
        };
      }
      const { text, bytes, tooLarge } = await readBody(res, maxBytes);
      if (tooLarge) {
        return {
          ...base,
          finalUrl: current.toString(),
          status: res.status,
          ok: false,
          contentType,
          body: null,
          isPdf,
          ms: Date.now() - started,
          blockedReason: "too-large",
        };
      }
      let body = text;
      if (isPdf && bytes && res.ok) {
        try {
          body = await pdfToText(bytes);
        } catch (err) {
          return {
            ...base,
            finalUrl: current.toString(),
            status: res.status,
            ok: false,
            contentType,
            body: null,
            isPdf,
            ms: Date.now() - started,
            error: `Could not read PDF: ${(err as Error).message}`,
          };
        }
      }
      const challenge = !isPdf && isChallenge(res.status, res.headers as unknown as Headers, body);
      return {
        ...base,
        finalUrl: current.toString(),
        status: res.status,
        ok: res.ok && !challenge,
        contentType,
        body,
        isPdf,
        ms: Date.now() - started,
        blockedReason: challenge ? "bot-challenge" : undefined,
        error: !res.ok ? `HTTP ${res.status}` : undefined,
      };
    } finally {
      release();
    }
  }
  return {
    ...base,
    finalUrl: current.toString(),
    status: 0,
    ok: false,
    contentType: null,
    body: null,
    isPdf: false,
    ms: Date.now() - started,
    blockedReason: "too-many-redirects",
  };
}

/**
 * Fetch a page politely: checks robots.txt for the origin first, honors
 * Crawl-delay, and validates every redirect hop with `isAllowedUrl`.
 */
export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const target = new URL(url);
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error(`Unsupported protocol: ${target.protocol}`);
  }
  if (!opts.skipRobots) {
    const { policy, unreachable } = await robotsFor(target.origin);
    const path = `${target.pathname}${target.search}`;
    if (policy === "disallow-all" || !isAllowed(policy, path)) {
      // When robots.txt itself was unreachable, report the underlying cause (TLS, bot challenge, network).
      const reason: BlockedReason = unreachable?.reason ?? "robots";
      return {
        url,
        finalUrl: url,
        status: 0,
        ok: false,
        contentType: null,
        body: null,
        isPdf: false,
        ms: 0,
        fetchedAt: new Date().toISOString(),
        blockedReason: reason,
        error: unreachable ? `Site unreachable (${unreachable.detail})` : "Disallowed by robots.txt",
      };
    }
    if (policy.crawlDelayMs) {
      const slot = hosts.get(target.host);
      if (slot) slot.nextStart = Math.max(slot.nextStart, Date.now() + policy.crawlDelayMs - MIN_HOST_INTERVAL_MS);
    }
  }
  return fetchRaw(url, opts);
}

export function describeBlocked(result: Pick<FetchResult, "blockedReason" | "error" | "status">): string {
  switch (result.blockedReason) {
    case "robots":
      return "robots.txt does not allow automated reading of this page";
    case "bot-challenge":
      return "the site answered with a bot challenge; WhyUs does not try to get past these";
    case "tls":
      return "the site's TLS certificate chain could not be validated";
    case "off-domain-redirect":
      return "the page redirected off the school's official domains";
    case "not-official":
      return "not an official school domain";
    case "too-many-redirects":
      return "too many redirects";
    case "unsupported-content":
      return "not an HTML or PDF page";
    case "too-large":
      return "page too large to read";
    default:
      return result.error ?? (result.status ? `HTTP ${result.status}` : "network error");
  }
}
