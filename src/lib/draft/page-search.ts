/**
 * Search over cached official pages (normalized page text from the `pages`
 * table) for the exact phrase a draft uses. Pure: the caller loads the pages.
 */
import { codeKey, type Claim } from "./claims";
import { containsWords, normName } from "./text";

export interface CachedPage {
  /** Final URL of the official page. */
  url: string;
  title: string;
  text: string;
  /** ISO timestamp the page text was read. */
  fetchedAt: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class PageCorpus {
  private normalized = new Map<number, string>();

  constructor(readonly pages: CachedPage[]) {}

  get size(): number {
    return this.pages.length;
  }

  private normText(i: number): string {
    let t = this.normalized.get(i);
    if (t === undefined) {
      t = normName(this.pages[i].text ?? "");
      this.normalized.set(i, t);
    }
    return t;
  }

  private findNormalized(needles: string[]): CachedPage | null {
    const wanted = needles.filter(Boolean);
    if (wanted.length === 0) return null;
    for (let i = 0; i < this.pages.length; i++) {
      const hay = this.normText(i);
      if (wanted.some((n) => containsWords(hay, n))) return this.pages[i];
    }
    return null;
  }

  /** The first cached official page that contains the claim's exact phrase. */
  find(claim: Pick<Claim, "kind" | "query">): CachedPage | null {
    if (this.pages.length === 0) return null;
    switch (claim.kind) {
      case "course":
        return this.findNormalized([codeKey(claim.query)]);
      case "person": {
        const key = normName(claim.query);
        const tokens = key.split(" ").filter((t) => t.length > 1);
        if (tokens.length >= 2) return this.findNormalized([key]);
        if (tokens.length === 1) return this.findNormalized([`professor ${tokens[0]}`, `prof ${tokens[0]}`, `dr ${tokens[0]}`]);
        return null;
      }
      case "acronym": {
        const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(claim.query)}(?![A-Za-z0-9])`);
        return this.pages.find((p) => re.test(p.text ?? "")) ?? null;
      }
      default: {
        const key = normName(claim.query);
        if (key.split(" ").length < 2) return null;
        return this.findNormalized([key]);
      }
    }
  }
}
