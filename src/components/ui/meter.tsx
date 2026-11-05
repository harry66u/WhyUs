import { cn } from "./cn";

/**
 * Uniqueness meter: five segments filled in proportion to a 0-100 score.
 * The accent marks distinctiveness; low scores stay neutral rather than red,
 * because "commonly mentioned" is information, not an error.
 */
export function UniquenessMeter({
  score,
  className,
  showValue = true,
  size = "md",
  label,
}: {
  score: number;
  className?: string;
  showValue?: boolean;
  size?: "sm" | "md";
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const filled = Math.round((clamped / 100) * 5);
  const tone = clamped >= 70 ? "bg-accent" : clamped >= 45 ? "bg-[color-mix(in_srgb,var(--accent)_55%,var(--fg-subtle))]" : "bg-subtle";
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label ?? `Uniqueness ${clamped} out of 100`}
    >
      <span className={cn("flex gap-[3px]", size === "sm" ? "h-2" : "h-2.5")}>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={cn("rounded-[2px]", size === "sm" ? "w-2.5" : "w-3.5", i < filled ? tone : "bg-line-strong")}
          />
        ))}
      </span>
      {showValue ? <span className="tabular text-xs text-muted">{clamped}</span> : null}
    </span>
  );
}

/** A thin progress bar for research progress. */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className={cn("block h-1 w-full overflow-hidden rounded-full bg-line", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <span className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${v}%` }} />
    </span>
  );
}
