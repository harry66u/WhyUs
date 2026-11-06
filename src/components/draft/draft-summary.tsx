import { useId } from "react";
import { cn } from "@/components/ui/cn";
import { summaryItems } from "@/lib/draft/present";
import type { DraftCheckResult } from "@/lib/types";
import { Swatch } from "./styles";

function wordLine(result: Pick<DraftCheckResult, "wordCount" | "wordLimit">): { text: string; over: boolean } {
  if (!result.wordLimit) return { text: "No word limit for this prompt", over: false };
  const diff = result.wordLimit - result.wordCount;
  if (diff < 0) return { text: `${-diff} over the limit`, over: true };
  if (diff === 0) return { text: "Exactly at the limit", over: false };
  return { text: `${diff} under the limit`, over: false };
}

/** Word count against the limit, and a count per kind of note with its highlight as the legend. */
export function DraftSummary({ result, className }: { result: DraftCheckResult; className?: string }) {
  const titleId = useId();
  const items = summaryItems(result);
  const words = wordLine(result);

  return (
    <section aria-labelledby={titleId} className={cn("grid gap-x-12 gap-y-6 border-y border-line py-6 md:grid-cols-[11rem_minmax(0,1fr)]", className)}>
      <h3 id={titleId} className="sr-only">
        Summary
      </h3>
      <div>
        <p className="text-xs text-subtle">Word count</p>
        <p className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-fg">
          <span className="tabular">{result.wordCount}</span>
          {result.wordLimit ? <span className="tabular text-lg font-normal tracking-normal text-subtle"> / {result.wordLimit}</span> : null}
        </p>
        <p className={cn("mt-1 text-xs", words.over ? "text-bad" : "text-muted")}>{words.text}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.key} className="min-w-0">
            <dt className="flex items-center gap-2 text-xs text-muted">
              <Swatch style={item.style} className="text-[0.8rem]" />
              <span className="min-w-0">{item.label}</span>
            </dt>
            <dd className={cn("tabular mt-1 text-xl font-semibold tracking-[-0.02em]", item.count === 0 ? "text-subtle" : "text-fg")}>{item.count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
