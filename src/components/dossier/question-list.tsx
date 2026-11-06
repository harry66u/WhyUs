import { cn } from "@/components/ui/cn";
import type { DossierDetail, DossierQuestion } from "@/lib/types";
import { AUDIENCE_LABELS, detailAnchor, questionRef } from "./model";

/** Specific questions to ask, each with who to ask and the detail it is about. */
export function QuestionList({
  questions,
  details,
  idPrefix = "dossier",
  className,
}: {
  questions: DossierQuestion[];
  details: DossierDetail[];
  idPrefix?: string;
  className?: string;
}) {
  if (!questions || questions.length === 0) {
    return <p className={cn("text-sm text-subtle", className)}>No questions were proposed for this school.</p>;
  }
  return (
    <ul role="list" className={cn("divide-y divide-line", className)}>
      {questions.map((q, i) => {
        const ref = questionRef(q, details);
        return (
          <li key={`${i}-${q.text.slice(0, 24)}`} className="break-inside-avoid py-5 first:pt-0 last:pb-0" data-audience={q.audience}>
            <p className="text-xs text-subtle">{AUDIENCE_LABELS[q.audience] ?? "Ask"}</p>
            <p className="mt-1.5 font-serif text-md/[1.6] text-pretty text-fg">{q.text}</p>
            {ref ? (
              <p className="mt-1.5 text-xs text-subtle">
                About{" "}
                <a
                  href={`#${detailAnchor(idPrefix, ref.rank)}`}
                  className="text-muted underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-fg hover:decoration-accent-line"
                >
                  {ref.title}
                </a>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
