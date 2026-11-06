import { cn } from "@/components/ui/cn";
import type { SwapStatus } from "@/lib/types";

/**
 * The briefing's swap-test glyph, drawn exactly like SwapGlyph in
 * components/dossier/swap-row (a test compares the two). It lives here because
 * the dossier module's file imports the school registry, which client
 * components on the landing page must not pull into the browser bundle.
 *
 * filled: equivalent, half: similar, open ring: no equivalent found,
 * dashed ring: that school has not been researched yet.
 */
const TONE: Record<SwapStatus, string> = {
  equivalent: "text-muted",
  similar: "text-muted",
  none: "text-ok",
  unknown: "text-subtle",
};

export function DemoSwapGlyph({ status, className }: { status: SwapStatus; className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      aria-hidden="true"
      focusable="false"
      className={cn(TONE[status], className)}
      data-swap-glyph={status}
    >
      {status === "equivalent" ? <circle cx="6" cy="6" r="4.25" fill="currentColor" /> : null}
      {status === "similar" ? (
        <>
          <circle cx="6" cy="6" r="4.25" />
          <path d="M6 1.75a4.25 4.25 0 0 1 0 8.5z" fill="currentColor" stroke="none" />
        </>
      ) : null}
      {status === "none" ? <circle cx="6" cy="6" r="4.25" /> : null}
      {status === "unknown" ? <circle cx="6" cy="6" r="4.25" strokeDasharray="1.7 1.6" /> : null}
    </svg>
  );
}

/** Short status words for compact places (the console, glyph tooltips). */
export const SWAP_WORDS: Record<SwapStatus, string> = {
  equivalent: "equivalent",
  similar: "similar",
  none: "no equivalent",
  unknown: "not researched",
};
