"use client";

import { cn } from "@/components/ui/cn";
import { SourceLink } from "@/components/ui/misc";
import { highlightOf, isPhraseFlag, issueLabel, type NumberedIssue } from "@/lib/draft/present";
import { shortUrl } from "@/lib/format";
import { Swatch } from "./styles";

/**
 * One margin note: what kind of problem (or confirmation), the words it is
 * about, one sentence explaining it, and where the evidence is. Notes never
 * contain replacement wording.
 */
export function DraftNote({
  issue,
  domId,
  active,
  onActivate,
}: {
  issue: NumberedIssue;
  domId: string;
  active: boolean;
  onActivate: (id: string | null) => void;
}) {
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
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onActivate(null);
      }}
      className={cn(
        "-mx-3 rounded-md px-3 py-2.5 transition-colors duration-150 focus-visible:outline-offset-0",
        active ? "bg-hover" : "bg-transparent",
      )}
    >
      <p id={labelId} className="flex items-center gap-2 text-xs font-medium text-fg">
        {style ? <Swatch style={style} className="text-[0.8rem]" /> : null}
        {issueLabel(issue)}
      </p>
      {issue.excerpt ? (
        <p className={cn("mt-1.5 font-serif text-[0.95rem]/[1.45] text-pretty text-fg", sentenceLevel && "line-clamp-2 text-muted")}>
          <span className="sr-only">About: </span>“{issue.excerpt}”
        </p>
      ) : null}
      <p className="mt-1.5 text-xs leading-[1.5] text-pretty text-muted">{issue.message}</p>

      {issue.type === "verified_claim" && issue.sourceUrl ? <SourceLink className="mt-2" url={issue.sourceUrl} verifiedAt={issue.verifiedAt} /> : null}

      {issue.type === "unverified_claim" && issue.sourceUrl ? (
        <p className="mt-2 text-xs text-subtle">
          Closest official page{" "}
          <a
            href={issue.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-muted underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-fg hover:decoration-accent-line"
          >
            {shortUrl(issue.sourceUrl, 48)}
          </a>
        </p>
      ) : null}

      {issue.type === "wrong_school" && issue.sourceUrl ? <SourceLink className="mt-2" url={issue.sourceUrl} /> : null}

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
