/**
 * Claude access for WhyUs.
 *
 * Claude is optional: every feature has a deterministic path, and Claude makes
 * the research engine discover new schools, write better match explanations,
 * angles and questions, parse uploaded activity lists, and read official pages
 * that block ordinary bots (via the web fetch server tool).
 *
 * - Model: claude-opus-5-5 by default (override with WHYUS_MODEL).
 * - Structured outputs via Zod schemas (no forced tool_choice, which this model rejects).
 * - Server-side refusal fallbacks are on (`fallbacks: "default"`).
 * - Only ANTHROPIC_API_KEY enables Claude; the base URL is pinned to the public
 *   API unless WHYUS_ANTHROPIC_BASE_URL is set, so the app never inherits an
 *   unrelated ANTHROPIC_BASE_URL from its environment.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const CLAUDE_MODEL = process.env.WHYUS_MODEL || "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export function llmAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.WHYUS_DISABLE_LLM !== "1";
}

let client: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (!llmAvailable()) throw new Error("Claude is not configured (set ANTHROPIC_API_KEY)");
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.WHYUS_ANTHROPIC_BASE_URL || "https://api.anthropic.com",
      maxRetries: 2,
      timeout: 180_000,
    });
  }
  return client;
}

export class ClaudeRefusalError extends Error {
  constructor(public category: string | null, message: string) {
    super(message);
    this.name = "ClaudeRefusalError";
  }
}

/**
 * One structured-output call. Returns the parsed object or throws.
 * Callers must catch and fall back to the deterministic path.
 */
export async function generateStructured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  user: string | Anthropic.Beta.BetaContentBlockParam[];
  effort?: Effort;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<z.infer<S>> {
  const res = await getClaude().beta.messages.parse(
    {
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { format: betaZodOutputFormat(opts.schema), effort: opts.effort ?? "low" },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    },
    { signal: opts.signal },
  );
  if (res.stop_reason === "refusal") {
    throw new ClaudeRefusalError(res.stop_details?.category ?? null, res.stop_details?.explanation ?? "Claude declined the request");
  }
  if (res.stop_reason === "max_tokens") throw new Error("Claude response was cut off (max_tokens)");
  if (res.parsed_output == null) throw new Error("Claude returned no parseable output");
  return res.parsed_output as z.infer<S>;
}
