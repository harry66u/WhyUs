"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { IconBlocked, IconCheck, IconMatch, IconPage, IconX } from "@/components/ui/icons";
import type { Counters } from "./state";

/** A number that ticks to its new value (instantly when reduced motion is on). */
export function TickingNumber({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  // The value currently on screen, so an interrupted tick continues from where it is.
  const current = useRef(value);
  useEffect(() => {
    if (reduce || current.current === value) return;
    const controls = animate(current.current, value, {
      duration: Math.min(0.6, 0.18 + Math.abs(value - current.current) * 0.04),
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        current.current = v;
        setShown(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, reduce]);
  return <span className={cn("tabular", className)}>{reduce ? value : shown}</span>;
}

const ITEMS: { key: keyof Counters; label: string; glyph: ReactNode; hint: string }[] = [
  { key: "pagesRead", label: "Pages read", glyph: <IconPage size={13} className="text-subtle" />, hint: "Official pages read live or from today's cache" },
  {
    key: "pagesBlocked",
    label: "Pages blocked",
    glyph: <IconBlocked size={13} className="text-bad" />,
    hint: "Pages that could not be read: blocked by the site, gone, or not responding",
  },
  { key: "factsVerified", label: "Facts verified", glyph: <IconCheck size={13} className="text-ok" />, hint: "Quote and name found on the current official page" },
  { key: "factsRejected", label: "Facts rejected", glyph: <IconX size={13} className="text-bad" />, hint: "Not on the current page, or the page could not be checked" },
  { key: "matches", label: "Matches", glyph: <IconMatch size={13} className="text-info" />, hint: "Verified facts matched to the activity list" },
];

export function CounterStrip({ counters }: { counters: Counters }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line shadow-[0_0_0_1px_var(--line)] sm:grid-cols-5">
      {ITEMS.map((item, i) => (
        <div key={item.key} className={cn("bg-raised px-4 py-3.5 sm:px-5 sm:py-4", i === ITEMS.length - 1 && "col-span-2 sm:col-span-1")} title={item.hint}>
          <dt className="flex items-center gap-1.5 text-2xs text-muted">
            {item.glyph}
            {item.label}
          </dt>
          <dd className="mt-1.5 text-2xl font-semibold tracking-[-0.03em] text-fg">
            <TickingNumber value={counters[item.key]} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
