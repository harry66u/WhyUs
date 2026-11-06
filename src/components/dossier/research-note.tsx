import type { CSSProperties } from "react";
import { cn } from "@/components/ui/cn";
import { RESEARCH_POLICY_NOTE } from "@/lib/types";

/** The research-use note every briefing carries (consistent with college AI policies). */
export function ResearchNote({
  note,
  headingId = "dossier-research-note",
  className,
  style,
}: {
  note?: string | null;
  headingId?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className={cn("break-inside-avoid rounded-lg bg-sunken px-5 py-4 shadow-[0_0_0_1px_var(--line)]", className)}
      style={style}
    >
      <h2 id={headingId} className="text-sm font-medium text-fg">
        Research note
      </h2>
      <p className="mt-1.5 max-w-[68ch] text-sm/[1.6] text-muted">{note?.trim() || RESEARCH_POLICY_NOTE}</p>
    </section>
  );
}
