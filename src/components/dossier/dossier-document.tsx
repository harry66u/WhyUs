import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import type { Dossier } from "@/lib/types";
import { AngleList } from "./angle-list";
import { DetailEntry } from "./detail-entry";
import { DossierHeader } from "./dossier-header";
import { detailAnchor, rankedDetails } from "./model";
import { QuestionList } from "./question-list";
import { ResearchNote } from "./research-note";
import { ScoreScale } from "./score-scale";

export interface DossierDocumentProps {
  dossier: Dossier;
  /** Student's first name for the header. Omit on surfaces that must not show account data. */
  preparedFor?: string | null;
  /** Prefix for element ids, so two briefings can share a page. */
  idPrefix?: string;
  /** Let the briefing assemble on load (opacity and a 6px rise; off under reduced motion). */
  animated?: boolean;
  className?: string;
}

/** A section of the briefing with a sans heading over document content. */
export function BriefingSection({
  id,
  title,
  description,
  children,
  className,
  style,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section aria-labelledby={id} className={cn("border-t border-line pt-8", className)} style={style}>
      <div data-section-head="" className="mb-7 break-inside-avoid break-after-avoid">
        <h2 id={id} className="text-md font-semibold tracking-[-0.015em] text-fg">
          {title}
        </h2>
        {description ? <p className="mt-1 max-w-[62ch] text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function enter(animated: boolean, delayMs: number): { className?: string; style?: CSSProperties } {
  if (!animated) return {};
  return { className: "animate-enter", style: { animationDelay: `${Math.min(delayMs, 640)}ms` } };
}

/**
 * The full briefing rendered from a Dossier: header, uniqueness score, ranked
 * details, essay angles, questions, and the research note. Server-safe and
 * hook-free, so it renders in server components, client components, and tests.
 *
 * Responsive to its own width through the `@container/dossier` query container
 * it creates: the rank numbers hang in a left margin and the uniqueness and
 * swap-test rail moves beside the text once there is room.
 */
export function DossierDocument({ dossier, preparedFor, idPrefix = "dossier", animated = false, className }: DossierDocumentProps) {
  const details = rankedDetails(dossier);
  const ids = {
    title: `${idPrefix}-title`,
    score: `${idPrefix}-score`,
    details: `${idPrefix}-details`,
    angles: `${idPrefix}-angles`,
    questions: `${idPrefix}-questions`,
    note: `${idPrefix}-research-note`,
  };
  const comparedSchools = details.some((d) => (d.swap?.length ?? 0) > 0);
  const header = enter(animated, 0);
  const score = enter(animated, 70);
  const after = enter(animated, 140 + details.length * 45);

  return (
    <article data-dossier-document="" aria-labelledby={ids.title} className={cn("@container/dossier", className)}>
      <div className="@xl/dossier:pl-12">
        <DossierHeader
          dossier={dossier}
          preparedFor={preparedFor}
          titleId={ids.title}
          className={header.className}
          style={header.style}
        />

        <ScoreScale
          score={dossier.uniquenessScore}
          details={details}
          headingId={ids.score}
          className={cn("mt-10", score.className)}
          style={score.style}
        />

        <BriefingSection
          id={ids.details}
          title="Ranked details"
          description={
            comparedSchools
              ? "Ranked by how directly each detail connects to your activities. Each was confirmed on the official page cited, and the swap test checks whether your other schools have the same thing."
              : "Ranked by how directly each detail connects to your activities. Each was confirmed on the official page cited. The swap test runs once the list has another school to compare."
          }
          className="mt-12"
        >
          {details.length > 0 ? (
            <ol role="list" className="divide-y divide-line">
              {details.map((detail, i) => {
                const motion = enter(animated, 140 + i * 45);
                return (
                  <li key={detail.factId} className={cn("py-9 first:pt-0 last:pb-2", motion.className)} style={motion.style}>
                    <DetailEntry
                      detail={detail}
                      dossier={dossier}
                      anchorId={detailAnchor(idPrefix, detail.rank)}
                      showSwap={comparedSchools}
                    />
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-subtle">No details passed verification for this school.</p>
          )}
        </BriefingSection>

        <BriefingSection
          id={ids.angles}
          title="Essay angles"
          description="Possible directions, one line each. They are ideas to test against your own experience, not text for your essay."
          className={cn("mt-12", after.className)}
          style={after.style}
        >
          <AngleList angles={dossier.angles} details={details} idPrefix={idPrefix} />
        </BriefingSection>

        <BriefingSection
          id={ids.questions}
          title="Questions to ask"
          description="Specific questions for an info session or a current student, drawn from the details above."
          className={cn("mt-12", after.className)}
          style={after.style}
        >
          <QuestionList questions={dossier.questions} details={details} idPrefix={idPrefix} />
        </BriefingSection>

        <ResearchNote note={dossier.policyNote} headingId={ids.note} className={cn("mt-14", after.className)} style={after.style} />
      </div>
    </article>
  );
}
