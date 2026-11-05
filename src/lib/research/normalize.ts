/**
 * Text normalization used to compare quotes against live page text.
 *
 * Matching is strict on words and order but tolerant of typography that differs
 * between how a page is authored and how a quote is copied: curly vs straight
 * quotes, dash variants, non-breaking and zero-width spaces, soft hyphens,
 * ligatures (via NFKC), letter case, and whitespace/line breaks.
 */
export function normalizeForMatch(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[­​-‍⁠﻿]/g, "") // soft hyphen, zero-width chars
    .replace(/[‘’‚‛′‵ʼ]/g, "'")
    .replace(/[“”„‟″‶]/g, '"')
    .replace(/[‐-―−⁃﹘﹣－]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   -   　]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a quote on ellipses into the segments that must each appear, in order. */
export function quoteSegments(quote: string): string[] {
  return normalizeForMatch(quote)
    .split(/\s*(?:\.\.\.|\[\.\.\.\])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}
