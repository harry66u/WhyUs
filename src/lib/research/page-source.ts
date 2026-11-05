/**
 * Page loading with caching. Wraps the polite fetcher and text extraction and
 * returns a normalized snapshot that verification and research can use.
 *
 * Two caches are available: an in-memory cache (scripts, tests) and the
 * database-backed cache in ./page-store.ts (the app).
 */
import { createHash } from "node:crypto";
import { extractPage, extractPlain, type ExtractedLink } from "./extract-text";
import { describeBlocked, fetchPage, type BlockedReason } from "./fetcher";

export interface PageSnapshot {
  url: string;
  finalUrl: string;
  host: string;
  status: number;
  ok: boolean;
  title: string;
  /** Full visible text (block-separated lines). Empty when not ok. */
  text: string;
  mainText: string;
  links: ExtractedLink[];
  headings: string[];
  contentHash: string | null;
  fetchedAt: string;
  ms: number;
  blockedReason?: BlockedReason;
  /** Human-readable reason the page could not be read. */
  problem?: string;
  fromCache: boolean;
}

export interface LoadOptions {
  /** Accept a cached copy no older than this. Default 12 hours. */
  maxAgeMs?: number;
  isAllowedUrl?: (url: URL) => boolean;
  signal?: AbortSignal;
}

export interface PageSource {
  load(url: string, opts?: LoadOptions): Promise<PageSnapshot>;
}

export const DEFAULT_PAGE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Fetch + extract, no caching. */
export async function loadPageUncached(url: string, opts: LoadOptions = {}): Promise<PageSnapshot> {
  const res = await fetchPage(url, { isAllowedUrl: opts.isAllowedUrl, signal: opts.signal });
  const host = (() => {
    try {
      return new URL(res.finalUrl).host;
    } catch {
      return "";
    }
  })();
  if (!res.ok || res.body === null) {
    return {
      url,
      finalUrl: res.finalUrl,
      host,
      status: res.status,
      ok: false,
      title: "",
      text: "",
      mainText: "",
      links: [],
      headings: [],
      contentHash: null,
      fetchedAt: res.fetchedAt,
      ms: res.ms,
      blockedReason: res.blockedReason,
      problem: describeBlocked(res),
      fromCache: false,
    };
  }
  const page = res.isPdf || !/html|xml/i.test(res.contentType ?? "text/html")
    ? extractPlain(res.body, decodeURIComponent(new URL(res.finalUrl).pathname.split("/").pop() ?? ""))
    : extractPage(res.body, res.finalUrl);
  return {
    url,
    finalUrl: res.finalUrl,
    host,
    status: res.status,
    ok: true,
    title: page.title,
    text: page.text,
    mainText: page.mainText,
    links: page.links,
    headings: page.headings,
    contentHash: createHash("sha256").update(page.text).digest("hex").slice(0, 16),
    fetchedAt: res.fetchedAt,
    ms: res.ms,
    fromCache: false,
  };
}

/** In-memory cache with in-flight de-duplication. */
export class MemoryPageSource implements PageSource {
  private cache = new Map<string, PageSnapshot>();
  private inflight = new Map<string, Promise<PageSnapshot>>();

  async load(url: string, opts: LoadOptions = {}): Promise<PageSnapshot> {
    const maxAge = opts.maxAgeMs ?? DEFAULT_PAGE_MAX_AGE_MS;
    const hit = this.cache.get(url);
    if (hit && Date.now() - Date.parse(hit.fetchedAt) <= maxAge) return { ...hit, fromCache: true };
    const pending = this.inflight.get(url);
    if (pending) return pending;
    const p = loadPageUncached(url, opts)
      .then((snap) => {
        this.cache.set(url, snap);
        return snap;
      })
      .finally(() => this.inflight.delete(url));
    this.inflight.set(url, p);
    return p;
  }
}
