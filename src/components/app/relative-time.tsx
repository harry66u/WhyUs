"use client";

import { useSyncExternalStore } from "react";
import { formatDate } from "@/lib/format";

/*
 * A shared clock that ticks every 30 seconds while anything shows a relative
 * time. The server snapshot is null, so server HTML shows the absolute date and
 * the relative form appears after hydration without a mismatch.
 */
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  now = Date.now();
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number | null {
  return useSyncExternalStore<number | null>(
    subscribe,
    () => now,
    () => null,
  );
}

/** "just now", "4 min ago", "3 hr ago", "yesterday", "5 days ago", then the date. */
export function formatRelative(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return formatDate(iso);
}

export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const current = useNow();
  return (
    <time dateTime={iso} title={formatDate(iso)} className={className}>
      {current === null ? formatDate(iso) : formatRelative(iso, current)}
    </time>
  );
}
