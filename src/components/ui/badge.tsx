import type { ComponentProps } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "accent" | "ok" | "bad" | "outline";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-hover text-muted",
  accent: "bg-accent-wash text-accent-text",
  ok: "bg-ok-wash text-ok",
  bad: "bg-bad-wash text-bad",
  outline: "text-muted shadow-[0_0_0_1px_var(--line-strong)]",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-2xs font-medium whitespace-nowrap", tones[tone], className)}
      {...props}
    />
  );
}
