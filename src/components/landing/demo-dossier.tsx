"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { TickingNumber } from "@/components/research/counters";
import type { ResearchViewState } from "@/components/research/state";
import { cn } from "@/components/ui/cn";
import { kindLabel } from "@/lib/format";
import type { DossierDetail, SwapResult } from "@/lib/types";
import { DemoSwapGlyph, SWAP_WORDS } from "./swap-glyph";
import type { ComparedSchool, LandingDemo } from "./types";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Rows shown in a wide pane and in a narrow one; the rest are summarized in one line. */
const WIDE_ROWS = 6;
const NARROW_ROWS = 4;

/** Same thresholds and fills as the UniquenessMeter primitive (70 / 45). */
function meterFill(score: number): string {
  if (score >= 70) return "bg-accent";
  if (score >= 45) return "bg-[color-mix(in_srgb,var(--accent)_55%,var(--fg-subtle))]";
  return "bg-subtle";
}

function labelOf(detail: DossierDetail): string {
  return detail.uniqueness.commonlyMentioned ? "Commonly mentioned" : detail.uniqueness.label;
}

/**
 * A five-segment uniqueness meter that fills in once the swap test has run.
 * Mirrors the UniquenessMeter primitive, with a short fill transition.
 */
function DemoMeter({ score, label, shown }: { score: number; label: string; shown: boolean }) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const filled = shown ? Math.round((value / 100) * 5) : 0;
  const segments = (
    <span className="flex h-2 gap-[3px]" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={cn("w-2.5 rounded-[2px] transition-colors duration-300 ease-out", i < filled ? meterFill(value) : "bg-line-strong")}
          style={{ transitionDelay: shown ? `${i * 70}ms` : "0ms" }}
        />
      ))}
    </span>
  );
  if (!shown) {
    return (
      <span className="inline-flex items-center gap-2">
        {segments}
        <span className="w-5" aria-hidden="true" />
        <span className="sr-only">Uniqueness is scored after the swap test.</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-2"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={`Uniqueness ${value} out of 100, ${label}`}
    >
      {segments}
      <span className="w-5 text-right text-xs tabular text-muted" aria-hidden="true">
        {value}
      </span>
    </span>
  );
}

function SwapCluster({ results, compared, shown }: { results: SwapResult[]; compared: ComparedSchool[]; shown: boolean }) {
  const ordered = compared.map(
    (c) => results.find((r) => r.schoolId === c.schoolId) ?? { schoolId: c.schoolId, schoolName: c.shortName, status: "unknown" as const },
  );
  if (!shown) {
    return (
      <span className="flex items-center gap-1.5" aria-hidden="true">
        {ordered.map((r) => (
          <span key={r.schoolId} className="grid h-3 w-3 place-items-center">
            <span className="h-1 w-1 rounded-full bg-line-strong" />
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      {ordered.map((r) => (
        <span key={r.schoolId} className="inline-flex" title={`${r.schoolName}: ${SWAP_WORDS[r.status]}`}>
          <DemoSwapGlyph status={r.status} />
          <span className="sr-only">
            {r.schoolName}: {SWAP_WORDS[r.status]}.
          </span>
        </span>
      ))}
    </span>
  );
}

function DetailRow({
  detail,
  index,
  matched,
  swapped,
  activityTitle,
  compared,
  reduce,
}: {
  detail: DossierDetail;
  index: number;
  matched: boolean;
  swapped: boolean;
  activityTitle?: string;
  compared: ComparedSchool[];
  reduce: boolean;
}) {
  const score = Math.max(0, Math.min(100, Math.round(detail.uniqueness.score)));
  const label = labelOf(detail);
  const marked = matched && detail.rank <= 3 && score >= 70;
  return (
    <li
      className={cn(
        "grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 py-2 @md:grid-cols-[1.5rem_minmax(0,1fr)_auto] @md:items-center",
        index >= WIDE_ROWS ? "hidden" : index >= NARROW_ROWS ? "hidden @md:grid" : null,
      )}
      data-demo-detail={detail.rank}
    >
      <span className={cn("self-start pt-0.5 text-sm tabular transition-colors duration-300", marked ? "text-accent-text" : "text-subtle")}>
        {detail.rank}
      </span>
      <div className="h-[2.625rem] min-w-0">
        {matched ? (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: EASE }}
            className="min-w-0"
          >
            <p className="truncate font-serif text-base leading-[1.4] text-fg">
              <a
                href={detail.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={detail.title}
                className="rounded-xs decoration-line-strong underline-offset-[3px] transition-colors hover:underline hover:decoration-accent-line"
              >
                {detail.title}
              </a>
            </p>
            <p className="mt-0.5 flex min-w-0 items-center gap-2 text-2xs text-subtle">
              <span className="shrink-0">{kindLabel(detail.kind)}</span>
              {activityTitle ? (
                <>
                  <span aria-hidden="true" className="h-2.5 w-px shrink-0 bg-line-strong" />
                  <span className="truncate">Fits {activityTitle}</span>
                </>
              ) : null}
              {detail.uniqueness.commonlyMentioned ? (
                <span className="inline-flex h-4 shrink-0 items-center rounded-full px-1.5 text-[0.6875rem] text-fg shadow-[0_0_0_1px_var(--line-strong)]">
                  Commonly mentioned
                </span>
              ) : null}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-2.5 pt-2" aria-hidden="true">
            <span className="block h-2 rounded-full bg-line" style={{ width: `${78 - (index % 4) * 9}%` }} />
            <span className="block h-2 rounded-full bg-line/60" style={{ width: `${44 - (index % 3) * 6}%` }} />
          </div>
        )}
      </div>
      <div className="col-start-2 mt-1.5 flex items-center gap-4 @md:col-start-3 @md:mt-0 @md:justify-end">
        <SwapCluster results={detail.swap ?? []} compared={compared} shown={swapped} />
        <DemoMeter score={score} label={label} shown={swapped} />
      </div>
    </li>
  );
}

/**
 * The dossier assembling: ranked details fill in as matches arrive, swap-test
 * glyphs and uniqueness meters as each detail is compared with the other
 * schools, then the overall score and the lead angle. Every row slot is
 * reserved from the start, so the pane never changes height.
 */
export function DemoDossier({ demo, state, reduce }: { demo: LandingDemo; state: ResearchViewState; reduce: boolean }) {
  const headingId = useId();
  const details = [...demo.dossier.details].sort((a, b) => a.rank - b.rank);
  const done = Boolean(state.done);
  const matched = details.filter((d) => state.matches[d.factId]).length;
  const lead = state.angles.find((a) => a.isLead);
  const finalLead = demo.dossier.angles.find((a) => a.isLead)?.line ?? demo.dossier.angles[0]?.line ?? null;
  const moreNarrow = Math.max(0, details.length - NARROW_ROWS);
  const moreWide = Math.max(0, details.length - WIDE_ROWS);
  const status = done ? "Final ranking" : matched > 0 ? "Ranking as matches arrive" : "Waiting for verified facts";
  const { summary } = demo;
  const more = (n: number) => `${n} more ${n === 1 ? "detail" : "details"} in the full dossier.`;

  return (
    <section aria-labelledby={headingId} className="@container flex min-w-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h3 id={headingId} className="text-sm font-medium text-fg">
          Dossier
        </h3>
        <span className="text-2xs text-muted">{status}</span>
      </header>

      <div className="flex flex-1 flex-col px-4 pt-3 pb-4 sm:px-5">
        <ol className="divide-y divide-line" aria-label="Ranked details">
          {details.map((d, i) => (
            <DetailRow
              key={d.factId}
              detail={d}
              index={i}
              matched={Boolean(state.matches[d.factId])}
              swapped={Boolean(state.swaps[d.factId])}
              activityTitle={state.matches[d.factId]?.activityTitle}
              compared={demo.compared}
              reduce={reduce}
            />
          ))}
        </ol>
        {moreNarrow > 0 ? (
          <p className="border-t border-line pt-2.5 text-2xs text-subtle @md:hidden">{more(moreNarrow)}</p>
        ) : null}
        {moreWide > 0 ? <p className="hidden border-t border-line pt-2.5 text-2xs text-subtle @md:block">{more(moreWide)}</p> : null}
        {demo.compared.length > 0 ? (
          <p className="mt-1.5 text-2xs text-subtle">
            Swap test circles, left to right: {demo.compared.map((c) => c.shortName).join(", ")}.
          </p>
        ) : null}

        <div className="mt-auto pt-4">
          <div className="grid gap-x-8 gap-y-4 border-t border-line pt-4 @lg:grid-cols-[9rem_minmax(0,1fr)]">
            <div>
              <p className="text-2xs text-muted">Uniqueness score</p>
              <p className={cn("mt-1 flex items-baseline gap-1.5 transition-opacity duration-300", done ? "opacity-100" : "opacity-0")} aria-hidden={!done}>
                <TickingNumber value={done ? summary.score : 0} className="text-[2rem] leading-none font-semibold tracking-[-0.04em] text-fg" />
                <span className="text-xs tabular text-subtle">/100</span>
              </p>
              <p className="mt-1.5 text-2xs">
                {done ? (
                  <span className={summary.bandTone === "accent" ? "font-medium text-accent-text" : "font-medium text-fg"}>{summary.bandLabel}</span>
                ) : (
                  <span className="text-subtle">Scored after the swap test</span>
                )}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-2xs text-muted">Lead angle</p>
              {/* The final line, invisible, reserves exactly the height the lead angle will take. */}
              <div className="mt-1 grid">
                <p aria-hidden="true" className="invisible col-start-1 row-start-1 font-serif text-[0.9375rem] leading-[1.45] text-pretty">
                  {finalLead ?? " "}
                </p>
                <div className="col-start-1 row-start-1 min-w-0">
                  {lead ? (
                    <motion.p
                      key={lead.line}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="font-serif text-[0.9375rem] leading-[1.45] text-pretty text-fg"
                    >
                      {lead.line}
                    </motion.p>
                  ) : (
                    <div className="space-y-2.5 pt-1.5" aria-hidden="true">
                      <span className="block h-2 w-[86%] rounded-full bg-line" />
                      <span className="block h-2 w-[52%] rounded-full bg-line/60" />
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-1 text-2xs text-subtle">An idea to test against your own experience, never text for your essay.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
