import type { CSSProperties } from "react";
import { cn } from "@/components/ui/cn";
import { formatDate } from "@/lib/format";
import type { Dossier } from "@/lib/types";
import { statsItems, wordLimitText } from "./model";

/**
 * The briefing masthead: school, unit, the exact prompt with its word limit,
 * and a quiet line with the generated date and how much was read and verified.
 */
export function DossierHeader({
  dossier,
  preparedFor,
  titleId = "dossier-title",
  className,
  style,
}: {
  dossier: Pick<Dossier, "schoolName" | "unitName" | "prompt" | "generatedAt" | "stats">;
  /** Student's first name. Leave out where account data must not appear. */
  preparedFor?: string | null;
  titleId?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const generated = formatDate(dossier.generatedAt);
  const stats = statsItems(dossier.stats);

  return (
    <header className={className} style={style}>
      <h1
        id={titleId}
        className="font-serif text-[2.125rem]/[1.12] font-normal tracking-[-0.022em] text-balance text-fg [font-optical-sizing:auto] @xl/dossier:text-[2.75rem]/[1.08]"
      >
        {dossier.schoolName}
      </h1>
      {dossier.unitName && dossier.unitName !== dossier.schoolName ? (
        <p className="mt-2 text-md text-muted">{dossier.unitName}</p>
      ) : null}

      <figure className="mt-8 max-w-[62ch]">
        <figcaption className="text-xs text-subtle">
          The prompt, <span className="tabular">{wordLimitText(dossier.prompt.wordLimit)}</span>
        </figcaption>
        <blockquote className="mt-2 font-serif text-lg/[1.6] text-pretty text-fg">
          <p>
            <span aria-hidden="true" className="-ml-[0.42em]">
              “
            </span>
            {dossier.prompt.text}
            <span aria-hidden="true">”</span>
          </p>
        </blockquote>
      </figure>

      <ul role="list" className={cn("mt-7 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-subtle")} aria-label="About this dossier">
        {preparedFor ? (
          <li>
            Prepared for <span className="text-muted">{preparedFor}</span>
          </li>
        ) : null}
        {generated ? (
          <li>
            Generated{" "}
            <time dateTime={dossier.generatedAt} className="tabular text-muted">
              {generated}
            </time>
          </li>
        ) : null}
        {stats.map((item) => (
          <li key={item} className="tabular">
            {item}
          </li>
        ))}
      </ul>
    </header>
  );
}
