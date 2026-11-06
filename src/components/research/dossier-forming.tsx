"use client";

import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { UniquenessMeter } from "@/components/ui/meter";
import { LiveDot, SourceLink } from "@/components/ui/misc";
import { kindLabel } from "@/lib/format";
import { formingItems, swapSummary, type ResearchViewState } from "./state";
import type { FinalDossierView } from "./types";

const EASE = [0.22, 1, 0.36, 1] as const;

interface Row {
  factId: string;
  title: string;
  kindText?: string;
  activityTitle?: string;
  sentence: string;
  uniqueness: number;
  uniquenessLabel?: string;
  swapText: string;
  sourceUrl?: string;
  verifiedAt?: string;
}

function rowsFromFinal(final: FinalDossierView): Row[] {
  return [...final.details]
    .sort((a, b) => a.rank - b.rank)
    .map((d) => ({
      factId: d.factId,
      title: d.title,
      kindText: kindLabel(d.kind),
      sentence: d.sentence,
      uniqueness: d.uniqueness.score,
      uniquenessLabel: d.uniqueness.label,
      swapText: swapSummary(d.swap),
      sourceUrl: d.sourceUrl,
      verifiedAt: d.verifiedAt,
    }));
}

function Placeholder({ verified, running }: { verified: number; running: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted">
        {!running
          ? "No details were matched in this run."
          : verified > 0
            ? `${verified} ${verified === 1 ? "fact" : "facts"} verified so far. Matched details appear here, ranked by how directly they connect to the activity list.`
            : "Matched details appear here as verified facts are compared with the activity list."}
      </p>
      <ol className="mt-4 space-y-1" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 px-2 py-3">
            <span className="text-sm tabular text-subtle/60">{i + 1}</span>
            <div className="space-y-2 pt-1.5">
              <span className="block h-2 rounded-full bg-line" style={{ width: `${72 - i * 6}%` }} />
              <span className="block h-2 rounded-full bg-line/70" style={{ width: `${48 - i * 4}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function DossierForming({
  state,
  final,
  running,
}: {
  state: ResearchViewState;
  final: FinalDossierView | null;
  running: boolean;
}) {
  const reduce = useReducedMotion();
  const settled = Boolean(final) && !running;
  const rows: Row[] = settled && final
    ? rowsFromFinal(final)
    : formingItems(state).map((item) => ({
        factId: item.factId,
        title: item.title,
        kindText: item.kind ? kindLabel(item.kind) : undefined,
        activityTitle: item.activityTitle,
        sentence: item.sentence,
        uniqueness: item.uniqueness,
        swapText: swapSummary(item.swap),
      }));
  const angles = settled && final ? final.angles : state.angles;
  const matchedCount = Object.keys(state.matches).length;

  return (
    <section aria-labelledby="dossier-forming-heading" className="min-w-0 rounded-lg bg-raised shadow-raise">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 id="dossier-forming-heading" className="text-sm font-medium text-fg">
          {settled ? "Dossier" : "Dossier forming"}
        </h2>
        {running ? (
          <span className="inline-flex items-center gap-2 text-2xs text-muted">
            <LiveDot />
            {matchedCount ? "Re-ranking as matches arrive" : "Waiting for matches"}
          </span>
        ) : settled ? (
          <span className="text-2xs text-muted">Final ranking</span>
        ) : null}
      </header>

      <div className="px-3 py-4 sm:px-4">
        {settled && final ? (
          <div className="mx-2 mb-4 flex items-end justify-between gap-4 border-b border-line pb-4">
            <div>
              <p className="text-2xs text-muted">Uniqueness</p>
              <p className="mt-0.5 text-3xl font-semibold tracking-[-0.035em] text-fg tabular">{Math.round(final.uniquenessScore)}</p>
            </div>
            <UniquenessMeter score={final.uniquenessScore} showValue={false} label={`Dossier uniqueness ${Math.round(final.uniquenessScore)} out of 100`} />
          </div>
        ) : null}

        {rows.length === 0 ? (
          <div className="px-2">
            <Placeholder verified={state.counters.factsVerified} running={running} />
          </div>
        ) : (
          <LayoutGroup>
            <ol className="space-y-0.5">
              <AnimatePresence initial={false}>
                {rows.map((row, i) => {
                  const distinctive = row.uniqueness >= 70;
                  return (
                    <motion.li
                      key={row.factId}
                      layout={reduce ? false : "position"}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      transition={{ duration: 0.24, ease: EASE, layout: { duration: 0.32, ease: EASE } }}
                      className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 rounded-md px-2 py-3"
                    >
                      <span className={cn("pt-0.5 text-sm tabular", i < 3 && distinctive ? "text-accent-text" : "text-subtle")}>{i + 1}</span>
                      <div className="min-w-0">
                        <p className="font-serif text-md leading-snug text-fg">{row.title}</p>
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-subtle">
                          {row.kindText ? <span>{row.kindText}</span> : null}
                          {row.activityTitle ? <span>Fits {row.activityTitle}</span> : null}
                        </p>
                        {row.sentence ? <p className="mt-1.5 font-serif text-[0.95rem] leading-relaxed text-muted">{row.sentence}</p> : null}
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <UniquenessMeter
                            score={row.uniqueness}
                            size="sm"
                            showValue={settled}
                            label={settled ? `Uniqueness ${row.uniqueness} out of 100` : `Estimated uniqueness ${row.uniqueness} out of 100`}
                          />
                          {row.uniquenessLabel ? <span className="text-2xs text-muted">{row.uniquenessLabel}</span> : null}
                          {row.swapText ? <span className="text-2xs text-subtle">{row.swapText}</span> : null}
                        </div>
                        {row.sourceUrl ? <SourceLink url={row.sourceUrl} verifiedAt={row.verifiedAt} className="mt-2" /> : null}
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
          </LayoutGroup>
        )}

        {angles.length ? (
          <div className="mx-2 mt-4 border-t border-line pt-4">
            <h3 className="text-xs font-medium text-fg">Angles to explore</h3>
            <p className="mt-0.5 text-2xs text-subtle">Ideas only, one line each. The essay is yours to write.</p>
            <ul className="mt-3 space-y-2.5">
              {angles.map((a, i) => (
                <li key={`${a.line}-${i}`} className="flex items-start gap-2.5">
                  {a.isLead ? (
                    <Badge tone="outline" className="mt-px">
                      Lead
                    </Badge>
                  ) : (
                    <span className="mt-[0.6rem] h-1 w-1 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
                  )}
                  <p className="font-serif text-[0.975rem] leading-relaxed text-fg">{a.line}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
