"use client";

import type { FocusEvent } from "react";
import { cn } from "@/components/ui/cn";
import { IconCheck, IconLink } from "@/components/ui/icons";
import { SourceLink } from "@/components/ui/misc";
import { highlightOf, isPhraseFlag, issueLabel, type NumberedIssue } from "@/lib/draft/present";
import { normName } from "@/lib/draft/text";
import { formatDate, shortUrl } from "@/lib/format";
import { Swatch } from "./styles";

type Activate = (id: string | null) => void;

const NOTE = "-mx-3 rounded-md px-3 py-2.5 transition-colors duration-150 focus-visible:outline-offset-0";

function leaveWithin(onActivate: Activate) {
  return (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onActivate(null);
  };
}

/**
 * One margin note: what kind of problem, the words it is about, one sentence
 * explaining it, and where the evidence is. Notes never contain replacement
 * wording.
 */
export function DraftNote({ issue, domId, active, onActivate }: { issue: NumberedIssue; domId: string; active: boolean; onActivate: Activate }) {
  const style = highlightOf(issue);
  const sentenceLevel = issue.type === "swappable" || (issue.type === "generic" && !isPhraseFlag(issue));
  const labelId = `${domId}-label`;

  return (
    <article
      id={domId}
      tabIndex={-1}
      aria-labelledby={labelId}
      data-active={active || undefined}
      onMouseEnter={() => onActivate(issue.id)}
      onMouseLeave={() => onActivate(null)}
      onFocus={() => onActivate(issue.id)}
      onBlur={leaveWithin(onActivate)}
      className={cn(NOTE, active ? "bg-hover" : "bg-transparent")}
    >
      <p id={labelId} className="flex items-center gap-2 text-xs font-medium text-fg">
        {style ? <Swatch style={style} className="text-[0.8rem]" /> : null}
        {issueLabel(issue)}
      </p>
      {issue.excerpt && !isPhraseFlag(issue) ? (
        // Beside the text on wide screens, a sentence-long excerpt only repeats it; screen readers still hear it.
        // A stock phrase is already quoted in its message.
        <p className={cn("mt-1.5 font-serif text-[0.95rem]/[1.45] text-pretty text-fg", sentenceLevel && "line-clamp-2 text-muted lg:sr-only")}>
          <span className="sr-only">About: </span>“{issue.excerpt}”
        </p>
      ) : null}
      <p className="mt-1.5 text-xs leading-[1.5] text-pretty text-muted">{issue.message}</p>

      {issue.type === "unverified_claim" && issue.sourceUrl ? (
        <div className="mt-2 min-w-0">
          <p className="text-2xs text-subtle">Closest official page</p>
          <SourceLink className="max-w-full" url={issue.sourceUrl} />
        </div>
      ) : null}

      {issue.type === "wrong_school" && issue.sourceUrl ? <SourceLink className="mt-2 max-w-full" url={issue.sourceUrl} /> : null}

      {issue.type === "swappable" && issue.otherSchools?.length ? (
        <ul role="list" className="mt-2 space-y-1">
          {issue.otherSchools.map((s) => (
            <li key={s.schoolId} className="text-xs leading-[1.45]">
              <span className="text-fg">{s.schoolName}</span>
              {s.equivalentTitle ? <span className="text-muted">: {s.equivalentTitle}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/**
 * The confirmed claims of one sentence: the words as written, the date they
 * were confirmed, and a link to the official page, titled with the official
 * name of what they matched.
 */
export function ConfirmedNote({
  issues,
  domId,
  active,
  onActivate,
}: {
  issues: NumberedIssue[];
  domId: string;
  active: string | null;
  onActivate: Activate;
}) {
  const labelId = `${domId}-label`;
  const anyActive = issues.some((i) => i.id === active);
  return (
    <article id={domId} tabIndex={-1} aria-labelledby={labelId} className={cn(NOTE, anyActive ? "bg-hover" : "bg-transparent")}>
      <p id={labelId} className="flex items-center gap-2 text-xs font-medium text-fg">
        <Swatch style="verified" className="text-[0.8rem]" />
        {issues.length === 1 ? "Confirmed on an official page" : "Confirmed on official pages"}
      </p>
      <ul role="list" className="mt-2 space-y-2.5">
        {issues.map((issue) => {
          const url = issue.sourceUrl ? shortUrl(issue.sourceUrl, 48) : "";
          // When the official name is just what the draft says, the page address is the useful part.
          const sameName = Boolean(issue.matchedTitle && normName(issue.matchedTitle) === normName(issue.excerpt ?? ""));
          const name = (!sameName && (issue.matchedTitle || issue.sourceTitle)) || url;
          return (
            <li
              key={issue.id}
              id={`${domId}-${issue.id}`}
              data-confirmed-id={issue.id}
              onMouseEnter={() => onActivate(issue.id)}
              onMouseLeave={() => onActivate(null)}
              onFocus={() => onActivate(issue.id)}
              onBlur={leaveWithin(onActivate)}
              className="min-w-0"
            >
              <p className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 font-serif text-[0.95rem]/[1.4] text-fg">{issue.excerpt}</span>
                {issue.verifiedAt ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-2xs text-ok">
                    <IconCheck size={11} />
                    <span className="tabular">{formatDate(issue.verifiedAt)}</span>
                  </span>
                ) : null}
              </p>
              {issue.sourceUrl ? (
                <a
                  href={issue.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={issue.sourceUrl}
                  className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-fg hover:decoration-accent-line"
                >
                  <span className="truncate">{name}</span>
                  <IconLink size={12} className="shrink-0" />
                  <span className="sr-only">(official source, opens in a new tab)</span>
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
