/**
 * Grounding checks: is a piece of text actually in the source the student gave us?
 *
 * Used to keep extracted activities honest. Comparison ignores case, punctuation,
 * bullet glyphs, and whitespace, so "Built 9 sensors; published data" is found in
 * "• Built 9 sensors\n• Published data".
 */

export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201a\u201b\u2032`\u00b4]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface GroundingIndex {
  /** True when every word of `fragment`, in order, appears contiguously in the source. Empty fragments are not grounded. */
  contains(fragment: string | null | undefined): boolean;
  /**
   * True when the description is in the source, either whole or as pieces
   * (bullet points or sentences joined into one description).
   */
  containsDescription(description: string): boolean;
  /** True when the number appears in the source as a standalone token. */
  containsNumber(n: number): boolean;
}

export function createGroundingIndex(source: string): GroundingIndex {
  const hay = ` ${normalizeForMatch(source)} `;
  const contains = (fragment: string | null | undefined): boolean => {
    if (!fragment) return false;
    const n = normalizeForMatch(fragment);
    return n.length > 0 && hay.includes(` ${n} `);
  };
  return {
    contains,
    containsDescription(description: string): boolean {
      if (contains(description)) return true;
      const pieces = description
        .split(/[;\n]|(?<=[.!?])\s+/)
        .map((p) => p.trim())
        .filter((p) => normalizeForMatch(p).length > 0);
      return pieces.length > 1 && pieces.every((p) => contains(p));
    },
    containsNumber(n: number): boolean {
      if (!Number.isFinite(n)) return false;
      return hay.includes(` ${normalizeForMatch(String(n))} `);
    },
  };
}
