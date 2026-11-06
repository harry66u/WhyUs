import { cn } from "@/components/ui/cn";
import type { HighlightStyle } from "@/lib/draft/present";

/**
 * Highlight styles for the checked draft. Each one differs in shape as well as
 * color, so no meaning depends on color alone:
 * - confirmed: solid underline (ok)
 * - could not confirm / another school: wavy underline on a red wash (bad)
 * - swappable sentence: amber wash
 * - generic: dotted underline
 */
export const HIGHLIGHT: Record<HighlightStyle, string> = {
  verified: "underline decoration-ok decoration-[1.5px] underline-offset-[5px]",
  problem: "bg-bad-wash underline decoration-bad decoration-wavy decoration-[1.25px] underline-offset-[5px]",
  swap: "bg-accent-wash",
  generic: "underline decoration-subtle decoration-dotted decoration-[1.5px] underline-offset-[5px]",
};

/** <mark> has a browser background and text color; the text color always follows the document. */
const MARK_BASE = "rounded-[2px] text-inherit box-decoration-clone transition-shadow duration-150";

/** Classes for one rendered segment, given the highlight styles that cover it (claims win over sentences). */
export function markClasses(styles: ReadonlySet<HighlightStyle>, active: boolean): string {
  const claim = styles.has("problem") ? "problem" : styles.has("verified") ? "verified" : null;
  const swap = claim !== "problem" && styles.has("swap");
  return cn(
    MARK_BASE,
    claim === "problem" && HIGHLIGHT.problem,
    claim === "verified" && HIGHLIGHT.verified,
    swap && HIGHLIGHT.swap,
    claim === null && styles.has("generic") && HIGHLIGHT.generic,
    // Only when nothing above sets a wash (utility order would otherwise let "transparent" win).
    claim !== "problem" && !swap && "bg-transparent",
    active && "shadow-[0_0_0_1.5px_var(--accent-line)]",
  );
}

/** A small sample of a highlight, used as a legend next to counts and note labels. */
export function Swatch({ style, className }: { style: HighlightStyle; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-block rounded-[2px] px-[2px] font-serif text-[0.95rem] leading-[1.15] text-fg box-decoration-clone", HIGHLIGHT[style], className)}>
      Aa
    </span>
  );
}
