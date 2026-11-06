/**
 * Optional fallback for official pages that answer the WhyUs reader with a bot
 * challenge: ask Claude's web fetch server tool (Anthropic's own fetcher,
 * restricted with `allowed_domains` to the school's official domains) for the
 * page, then verify quotes against the document text it returns.
 *
 * - WhyUs never tries to solve or evade a challenge itself; this asks a
 *   different, openly identified fetcher and accepts its answer, including "no".
 * - Only for bot challenges. Pages refused by robots.txt are never re-read here.
 * - Off without ANTHROPIC_API_KEY (and with WHYUS_DISABLE_CLAUDE_FETCH=1).
 * - Results are cached in memory for 12 hours so repeated runs do not re-fetch.
 */
import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL, getClaude, llmAvailable } from "@/lib/llm/client";
import { hostIsOfficial, isOfficialUrl } from "@/lib/schools/registry";
import type { School } from "@/lib/types";
import { extractPlain } from "./extract-text";
import type { PageSnapshot } from "./page-source";

/** Stored in VerificationResult.detail for facts confirmed through this fallback. */
export const CLAUDE_FETCH_NOTE =
  "Read through Claude's web fetch tool because the site answered the WhyUs reader with a bot challenge";

export type ClaudeFetchResult = { ok: true; page: PageSnapshot } | { ok: false; problem: string };

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_CONTINUATIONS = 2;

const g = globalThis as unknown as {
  __whyusClaudeFetchCache?: Map<string, { page: PageSnapshot; expires: number }>;
  __whyusClaudeFetchInflight?: Map<string, Promise<ClaudeFetchResult>>;
};

function cache() {
  if (!g.__whyusClaudeFetchCache) g.__whyusClaudeFetchCache = new Map();
  return g.__whyusClaudeFetchCache;
}

function inflight() {
  if (!g.__whyusClaudeFetchInflight) g.__whyusClaudeFetchInflight = new Map();
  return g.__whyusClaudeFetchInflight;
}

export function claudeFetchAvailable(): boolean {
  return llmAvailable() && process.env.WHYUS_DISABLE_CLAUDE_FETCH !== "1";
}

const ERROR_TEXT: Record<string, string> = {
  url_not_accessible: "Claude's web fetch tool could not read the page either",
  url_not_allowed: "the page is outside the school's official domains",
  url_not_in_prior_context: "Claude's web fetch tool refused the address",
  unsupported_content_type: "the page is not a readable document",
  content_too_large: "the page is too large to read",
  too_many_requests: "Claude's web fetch tool is rate limited right now",
  max_uses_exceeded: "Claude's web fetch tool reached its limit for this request",
  unavailable: "Claude's web fetch tool is unavailable right now",
  url_too_long: "the address is too long",
  invalid_tool_input: "Claude's web fetch tool rejected the address",
};

/** Markdown-ish document text -> plain text, so verbatim quotes match across links and emphasis. */
export function documentToPlainText(input: string): string {
  return input
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*$/gm, "")
    .replace(/\|/g, " ");
}

async function documentText(doc: Anthropic.DocumentBlock): Promise<string> {
  const source = doc.source;
  if (source.type === "text") return source.data;
  if (source.type === "base64" && source.media_type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(source.data, "base64")));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  return "";
}

function allowedDomains(school: School): string[] {
  return [...new Set([...school.officialDomains, ...school.officialHosts].map((d) => d.toLowerCase().replace(/^www\./, "")))];
}

async function fetchThroughClaude(url: string, school: School, signal?: AbortSignal): Promise<ClaudeFetchResult> {
  const started = Date.now();
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Use the web_fetch tool to fetch exactly this URL and nothing else: ${url}\nAfter the fetch completes, reply with the single word: done.`,
    },
  ];
  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const res = await getClaude().messages.create(
      {
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        output_config: { effort: "low" },
        tools: [
          {
            type: "web_fetch_20260209",
            name: "web_fetch",
            allowed_domains: allowedDomains(school),
            max_uses: 1,
            max_content_tokens: 60_000,
          },
        ],
        messages,
      },
      { signal },
    );
    const block = res.content.find((b): b is Anthropic.WebFetchToolResultBlock => b.type === "web_fetch_tool_result");
    if (block) {
      if (block.content.type === "web_fetch_tool_result_error") {
        return { ok: false, problem: ERROR_TEXT[block.content.error_code] ?? `Claude's web fetch tool failed (${block.content.error_code})` };
      }
      const fetched = block.content;
      const finalUrl = fetched.url || url;
      if (!isOfficialUrl(finalUrl, school)) return { ok: false, problem: "the page resolved outside the school's official domains" };
      const raw = await documentText(fetched.content);
      if (!raw.trim()) return { ok: false, problem: "Claude's web fetch tool returned an empty document" };
      // Keep both forms so a quote matches whether the tool returned markdown or plain text.
      const plain = extractPlain(`${documentToPlainText(raw)}\n${raw}`, fetched.content.title ?? "");
      const host = new URL(finalUrl).host;
      return {
        ok: true,
        page: {
          url,
          finalUrl,
          host,
          status: 200,
          ok: true,
          title: fetched.content.title ?? "",
          text: plain.text,
          mainText: plain.text,
          links: [],
          headings: [],
          contentHash: createHash("sha256").update(plain.text).digest("hex").slice(0, 16),
          fetchedAt: fetched.retrieved_at ?? new Date().toISOString(),
          ms: Date.now() - started,
          fromCache: false,
        },
      };
    }
    if (res.stop_reason === "pause_turn") {
      // The server-side loop paused before the fetch finished: send the turn back so it resumes.
      messages.push({ role: "assistant", content: res.content as unknown as Anthropic.ContentBlockParam[] });
      continue;
    }
    return { ok: false, problem: "Claude did not fetch the page" };
  }
  return { ok: false, problem: "Claude's web fetch tool did not finish in time" };
}

/**
 * Read an official page through Claude's web fetch tool. Returns a snapshot
 * that verifyAgainstPage can check, or the reason it could not be read.
 */
export async function readViaClaudeWebFetch(url: string, school: School, signal?: AbortSignal): Promise<ClaudeFetchResult> {
  if (!claudeFetchAvailable()) return { ok: false, problem: "Claude is not configured" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, problem: "not a valid address" };
  }
  if (parsed.protocol !== "https:" || !hostIsOfficial(parsed.host, school)) {
    return { ok: false, problem: "not an official school page" };
  }
  const hit = cache().get(url);
  if (hit && hit.expires > Date.now()) return { ok: true, page: { ...hit.page, fromCache: true, ms: 0 } };
  const pending = inflight().get(url);
  if (pending) return pending;
  const p = fetchThroughClaude(url, school, signal)
    .catch((err): ClaudeFetchResult => ({ ok: false, problem: `Claude's web fetch tool failed: ${(err as Error)?.message ?? "unknown error"}` }))
    .then((result) => {
      if (result.ok) cache().set(url, { page: result.page, expires: Date.now() + CACHE_TTL_MS });
      return result;
    })
    .finally(() => inflight().delete(url));
  inflight().set(url, p);
  return p;
}
