"use client";

import { cn } from "@/components/ui/cn";
import { IconCheck, IconX } from "@/components/ui/icons";
import { currentStage, type StageState } from "./state";

const statusText: Record<StageState["status"], string> = {
  pending: "not started",
  active: "in progress",
  done: "done",
  failed: "stopped",
};

function Marker({ stage }: { stage: StageState }) {
  return (
    <span
      className={cn(
        "relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium tabular transition-[background-color,box-shadow,color] duration-300 ease-out",
        stage.status === "pending" && "text-subtle shadow-[inset_0_0_0_1px_var(--line-strong)]",
        stage.status === "active" && "bg-accent-wash text-accent-text shadow-[inset_0_0_0_1px_var(--accent-line)]",
        stage.status === "done" && "bg-ok-wash text-ok",
        stage.status === "failed" && "bg-bad-wash text-bad",
      )}
      aria-hidden="true"
    >
      {stage.status === "done" ? <IconCheck size={14} /> : stage.status === "failed" ? <IconX size={13} /> : stage.index}
      {stage.status === "active" ? <span className="absolute -inset-1 rounded-full shadow-[0_0_0_1px_var(--accent-line)] animate-live" /> : null}
    </span>
  );
}

/**
 * The seven research stages. Desktop shows the full numbered track; narrow
 * screens show a segmented bar with the current step named.
 */
export function StageTrack({ stages }: { stages: StageState[] }) {
  const current = currentStage(stages);
  return (
    <div>
      <ol className="hidden grid-cols-7 sm:grid" aria-label="Research stages">
        {stages.map((stage, i) => (
          <li key={stage.stage} className="min-w-0" aria-current={stage.status === "active" ? "step" : undefined}>
            <div className="flex items-center">
              <Marker stage={stage} />
              {i < stages.length - 1 ? (
                <span
                  className={cn(
                    "mx-2 h-px flex-1 transition-colors duration-500",
                    stage.status === "done" ? "bg-[color-mix(in_srgb,var(--ok)_45%,transparent)]" : "bg-line",
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <p
              className={cn(
                "mt-3 pr-3 text-xs font-medium leading-snug transition-colors",
                stage.status === "pending" ? "text-subtle" : "text-fg",
              )}
            >
              {stage.label}
              <span className="sr-only">, {statusText[stage.status]}</span>
            </p>
            {stage.detail && stage.status !== "pending" ? (
              <p className="mt-1 line-clamp-3 pr-3 text-2xs text-subtle" title={stage.detail}>
                {stage.detail}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="sm:hidden">
        <div className="flex gap-1" aria-hidden="true">
          {stages.map((stage) => (
            <span
              key={stage.stage}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                stage.status === "done" && "bg-[color-mix(in_srgb,var(--ok)_70%,transparent)]",
                stage.status === "active" && "bg-accent",
                stage.status === "failed" && "bg-bad",
                stage.status === "pending" && "bg-line-strong",
              )}
            />
          ))}
        </div>
        <p className="mt-3 flex items-baseline gap-2 text-sm">
          <span className="tabular text-subtle">
            Step {current?.index ?? 1} of {stages.length}
          </span>
          <span className="font-medium text-fg">{current?.label ?? stages[0]?.label}</span>
        </p>
        {current?.detail ? <p className="mt-1 text-xs text-muted">{current.detail}</p> : null}
      </div>
    </div>
  );
}
