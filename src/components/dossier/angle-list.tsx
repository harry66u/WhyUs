import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import type { DossierDetail, EssayAngle } from "@/lib/types";
import { angleRefs, detailAnchor, orderedAngles } from "./model";

/**
 * Essay angles: one-line ideas, never drafted prose. The lead angle comes first
 * and is marked; each angle links to the ranked details it draws on.
 */
export function AngleList({
  angles,
  details,
  idPrefix = "dossier",
  className,
}: {
  angles: EssayAngle[];
  details: DossierDetail[];
  idPrefix?: string;
  className?: string;
}) {
  const list = orderedAngles(angles);
  if (list.length === 0) {
    return <p className={cn("text-sm text-subtle", className)}>No angles were proposed for this school.</p>;
  }
  return (
    <ul role="list" className={cn("space-y-7", className)}>
      {list.map((angle) => {
        const refs = angleRefs(angle, details);
        return (
          <li key={angle.key} className="break-inside-avoid" data-angle-lead={angle.isLead ? "true" : undefined}>
            {angle.isLead ? (
              <p className="mb-2">
                <Badge tone="accent">Lead angle</Badge>
              </p>
            ) : null}
            <p className={cn("font-serif text-pretty text-fg", angle.isLead ? "text-xl/[1.45]" : "text-lg/[1.5]")}>{angle.line}</p>
            {refs.length > 0 ? (
              <p className="mt-2 text-xs text-subtle">
                Draws on{" "}
                {refs.map((ref, i) => (
                  <Fragment key={ref.rank}>
                    <a
                      href={`#${detailAnchor(idPrefix, ref.rank)}`}
                      className="text-muted underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-fg hover:decoration-accent-line"
                    >
                      {ref.title}
                    </a>
                    {i < refs.length - 1 ? ", " : null}
                  </Fragment>
                ))}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
