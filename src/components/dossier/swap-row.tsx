import { cn } from "@/components/ui/cn";
import type { SwapResult, SwapStatus } from "@/lib/types";
import { swapOutcome } from "./model";

const GLYPH_TONE: Record<SwapStatus, string> = {
  equivalent: "text-muted",
  similar: "text-muted",
  none: "text-ok",
  unknown: "text-subtle",
};

/**
 * Swap test glyphs on a 12px grid: filled (the other school has an equivalent),
 * half (something similar), open ring (nothing comparable in its verified
 * research), dashed ring (that school has not been researched yet).
 */
export function SwapGlyph({ status, className }: { status: SwapStatus; className?: string }) {
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
      className={cn(GLYPH_TONE[status], className)}
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

/** One line per other school on the student's list. */
export function SwapRow({ results, className }: { results: SwapResult[]; className?: string }) {
  if (!results || results.length === 0) {
    return <p className={cn("text-xs text-subtle", className)}>No other schools on the list to compare yet.</p>;
  }
  return (
    <ul role="list" className={cn("space-y-2.5", className)}>
      {results.map((r) => {
        const { status, title } = swapOutcome(r);
        return (
          <li key={r.schoolId} className="flex gap-2.5" data-swap-status={r.status}>
            <SwapGlyph status={r.status} className="mt-[0.2rem] shrink-0" />
            <div className="min-w-0 text-xs leading-[1.45]">
              <p className="text-fg">{r.schoolName}</p>
              <p className="text-muted">
                {status}
                {title ? (
                  <>
                    {" "}
                    {r.equivalentUrl ? (
                      <a
                        href={r.equivalentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-fg hover:decoration-accent-line"
                      >
                        {title}
                      </a>
                    ) : (
                      <span>{title}</span>
                    )}
                  </>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
