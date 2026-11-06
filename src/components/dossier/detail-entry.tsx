import type { CSSProperties } from "react";
import { cn } from "@/components/ui/cn";
import { UniquenessMeter } from "@/components/ui/meter";
import { SourceLink } from "@/components/ui/misc";
import type { Dossier, DossierDetail } from "@/lib/types";
import { clampScore, detailScope, isTopRanked, kindLabel, uniquenessLabel } from "./model";
import { SwapRow } from "./swap-row";

/**
 * One ranked detail. Layout (inside a `@container/dossier`):
 * - narrow: rank and title share a row; uniqueness and the swap test follow
 *   the fit sentence; the quote and its citation close the entry.
 * - wide: the rank hangs in the document's left margin and uniqueness plus the
 *   swap test sit in a right-hand rail beside the text.
 */
export function DetailEntry({
  detail,
  dossier,
  anchorId,
  showSwap = true,
  className,
  style,
}: {
  detail: DossierDetail;
  dossier: Pick<Dossier, "schoolId" | "unitId" | "unitName">;
  /** Element id for in-page links; also prefixes the title id. */
  anchorId: string;
  /** Hide the swap test when the list has no other school to compare. */
  showSwap?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const scope = detailScope(detail, dossier);
  const label = uniquenessLabel(detail);
  const score = clampScore(detail.uniqueness.score);
  const titleId = `${anchorId}-title`;

  return (
    <article
      id={anchorId}
      aria-labelledby={titleId}
      className={cn("relative scroll-mt-24 break-inside-avoid", className)}
      style={style}
      data-dossier-detail={detail.rank}
    >
      <div className="grid grid-cols-1 @2xl/dossier:grid-cols-[minmax(0,1fr)_12.5rem] @2xl/dossier:grid-rows-[auto_1fr] @2xl/dossier:gap-x-10">
        {/* Title, kind and scope, summary, why it fits */}
        <div className="min-w-0 @2xl/dossier:col-start-1 @2xl/dossier:row-start-1">
          <div className="flex items-baseline gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "tabular w-5 shrink-0 text-sm font-medium @xl/dossier:absolute @xl/dossier:top-[0.3rem] @xl/dossier:-left-12 @xl/dossier:w-8 @xl/dossier:text-right",
                isTopRanked(detail) ? "text-accent-text" : "text-subtle",
              )}
            >
              {detail.rank}
            </span>
            <h3 id={titleId} className="min-w-0 font-serif text-xl/[1.3] font-medium tracking-[-0.012em] text-pretty text-fg">
              {detail.title}
            </h3>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
            <span className="text-muted">{kindLabel(detail.kind)}</span>
            {scope ? (
              <>
                <span aria-hidden="true" className="h-3 w-px bg-line-strong" />
                <span className="text-subtle">{scope}</span>
              </>
            ) : null}
          </p>
          <p className="mt-3 font-serif text-[1.0625rem]/[1.65] text-pretty text-fg">{detail.summary}</p>
          <div className="mt-4">
            <p className="text-xs font-medium text-muted">Why it fits you</p>
            <p className="mt-1 font-serif text-[1.0625rem]/[1.65] text-pretty text-fg">{detail.fit.sentence}</p>
          </div>
        </div>

        {/* Evidence rail: uniqueness and the swap test */}
        <dl className="mt-6 grid gap-5 @lg/dossier:grid-cols-2 @2xl/dossier:col-start-2 @2xl/dossier:row-span-2 @2xl/dossier:row-start-1 @2xl/dossier:mt-1 @2xl/dossier:grid-cols-1 @2xl/dossier:content-start @2xl/dossier:gap-6 @2xl/dossier:border-l @2xl/dossier:border-line @2xl/dossier:pl-6">
          <div>
            <dt className="text-xs font-medium text-muted">Uniqueness</dt>
            <dd className="mt-2">
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 [print-color-adjust:exact]">
                <UniquenessMeter score={score} size="sm" label={`Uniqueness ${score} out of 100, ${label}`} />
                {label === "Commonly mentioned" ? (
                  <span className="inline-flex h-5 items-center rounded-full px-2 text-2xs font-medium whitespace-nowrap text-fg shadow-[0_0_0_1px_var(--line-strong)]">
                    Commonly mentioned
                  </span>
                ) : (
                  <span className={cn("text-xs font-medium", label === "Distinctive" ? "text-accent-text" : "text-fg")}>{label}</span>
                )}
              </span>
              {detail.uniqueness.reason ? (
                <span className="mt-1.5 block text-xs leading-[1.5] text-subtle">{detail.uniqueness.reason}</span>
              ) : null}
            </dd>
          </div>
          {showSwap ? (
            <div>
              <dt className="text-xs font-medium text-muted">Swap test</dt>
              <dd className="mt-2">
                <SwapRow results={detail.swap} />
              </dd>
            </div>
          ) : null}
        </dl>

        {/* Where it was confirmed, with the verbatim quote one click away (always printed). */}
        <figure className="mt-5 min-w-0 self-start @2xl/dossier:col-start-1 @2xl/dossier:row-start-2 @2xl/dossier:mt-4">
          <figcaption className="min-w-0">
            <span className="sr-only">Source: </span>
            <SourceLink url={detail.sourceUrl} verifiedAt={detail.verifiedAt} className="max-w-full" />
          </figcaption>
          <details className="group mt-2 print:hidden">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-xs text-xs text-subtle transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="transition-transform duration-150 group-open:rotate-90">
                <path d="M3.5 2l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="group-open:hidden">Show the quoted text from this page</span>
              <span className="hidden group-open:inline">Hide the quoted text</span>
            </summary>
            <blockquote cite={detail.sourceUrl} className="mt-2.5 border-l-2 border-line-strong pl-4 font-serif text-[0.9375rem]/[1.6] text-muted">
              <p>
                <span aria-hidden="true">“</span>
                {detail.quote}
                <span aria-hidden="true">”</span>
              </p>
            </blockquote>
          </details>
          <blockquote cite={detail.sourceUrl} className="mt-2.5 hidden border-l-2 border-line-strong pl-4 font-serif text-[0.9375rem]/[1.6] text-muted print:block">
            <p>
              <span aria-hidden="true">“</span>
              {detail.quote}
              <span aria-hidden="true">”</span>
            </p>
          </blockquote>
        </figure>
      </div>
    </article>
  );
}
