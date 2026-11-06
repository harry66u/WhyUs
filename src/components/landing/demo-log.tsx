"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import type { LogEntry } from "@/components/research/state";
import { cn } from "@/components/ui/cn";
import { IconCheck, IconMatch, IconPage, IconQuote, IconSwap } from "@/components/ui/icons";
import { LiveDot } from "@/components/ui/misc";
import { formatDate } from "@/lib/format";
import { DemoSwapGlyph, SWAP_WORDS } from "./swap-glyph";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Lines kept on screen; older ones have already scrolled out of the console's view. */
const WINDOW = 22;

function HostChip({ host }: { host: string }) {
  return (
    <span className="inline-flex h-5 max-w-[11rem] shrink-0 items-center truncate rounded-xs bg-hover px-1.5 text-2xs text-muted shadow-[inset_0_0_0_1px_var(--line)]">
      {host}
    </span>
  );
}

function Row({ glyph, children }: { glyph: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2.5 px-2 py-1.5 text-xs leading-[1.3rem]">
      <span className="flex h-[1.3rem] items-center justify-center">{glyph}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Line({ entry, verifiedOn }: { entry: LogEntry; verifiedOn: Record<string, string> }): ReactNode {
  switch (entry.kind) {
    case "stage":
      if (entry.status === "start") {
        return (
          <div className="flex items-center gap-2.5 px-2 pt-3.5 pb-1">
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[0.625rem] font-semibold tabular text-subtle shadow-[inset_0_0_0_1px_var(--line-strong)]">
              {entry.index}
            </span>
            <span className="text-xs font-medium text-fg">{entry.label}</span>
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
          </div>
        );
      }
      return (
        <Row glyph={<IconCheck size={14} className="text-ok" />}>
          <p className="text-muted">{entry.detail}</p>
        </Row>
      );
    case "log":
      return (
        <Row glyph={<span className="block h-1 w-1 rounded-full bg-line-strong" />}>
          <p className="text-muted">{entry.message}</p>
        </Row>
      );
    case "page":
      return (
        <Row glyph={entry.status === "reading" ? <LiveDot /> : <IconPage size={14} className="text-subtle" />}>
          <p className="flex min-w-0 items-center gap-2">
            <HostChip host={entry.host} />
            <span className="shrink-0 text-muted">{entry.status === "reading" ? "Reading" : "Read"}</span>
            <span className="min-w-0 truncate text-fg" title={entry.url}>
              {entry.path}
            </span>
          </p>
        </Row>
      );
    case "fact": {
      const date = verifiedOn[entry.factId];
      return (
        <Row glyph={<IconCheck size={14} className="text-ok" />}>
          <p className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-ok">Verified</span>
            <span className="min-w-0 truncate font-medium text-fg">{entry.title}</span>
            {date ? (
              <span className="ml-auto hidden shrink-0 pl-2 text-2xs tabular text-subtle sm:inline">
                <span className="sr-only">on </span>
                {formatDate(date)}
              </span>
            ) : null}
          </p>
          {entry.quote ? (
            <p className="mt-0.5 truncate font-serif text-[0.875rem] text-muted">
              <span aria-hidden="true">“</span>
              {entry.quote}
              <span aria-hidden="true">”</span>
            </p>
          ) : null}
        </Row>
      );
    }
    case "match":
      return (
        <Row glyph={<IconMatch size={14} className="text-info" />}>
          <p className="line-clamp-2">
            <span className="text-muted">Matched </span>
            <span className="font-medium text-fg">{entry.title}</span>
            {entry.activityTitle ? (
              <>
                <span className="text-muted"> to </span>
                <span className="text-fg">{entry.activityTitle}</span>
              </>
            ) : null}
          </p>
          {entry.sentence ? <p className="mt-0.5 line-clamp-2 font-serif text-[0.875rem] leading-[1.3rem] text-muted">{entry.sentence}</p> : null}
        </Row>
      );
    case "swap":
      return (
        <Row glyph={<IconSwap size={14} className="text-info" />}>
          <p className="truncate">
            <span className="text-muted">Swap test </span>
            <span className="font-medium text-fg">{entry.title}</span>
          </p>
          {entry.results.length ? (
            <ul className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1" aria-label="Swap test results">
              {entry.results.map((r) => (
                <li key={r.schoolId} className="inline-flex items-center gap-1.5 text-2xs">
                  <DemoSwapGlyph status={r.status} className="shrink-0" />
                  <span className="text-muted">{r.schoolName}</span>
                  <span className="text-subtle">{SWAP_WORDS[r.status]}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Row>
      );
    case "angle":
      return (
        <Row glyph={<IconQuote size={14} className="text-muted" />}>
          <p className="text-muted">{entry.isLead ? "Lead angle" : "Angle"}</p>
          <p className="mt-0.5 font-serif text-[0.9375rem] leading-[1.4rem] text-fg">{entry.line}</p>
        </Row>
      );
    case "done":
      return (
        <Row glyph={<IconCheck size={14} className="text-ok" />}>
          <p className="text-fg">
            Dossier assembled. Uniqueness <span className="tabular">{entry.uniquenessScore}</span>.
          </p>
        </Row>
      );
    case "error":
      return (
        <Row glyph={<span className="block h-1 w-1 rounded-full bg-bad" />}>
          <p className="text-bad">{entry.message}</p>
        </Row>
      );
    default:
      return null;
  }
}

/**
 * The research log, newest line at the bottom. The list is anchored to the
 * bottom of its (fixed-height, clipped) container, so new lines push older
 * ones up and out of view, the way a console scrolls.
 */
export function DemoLog({
  entries,
  verifiedOn,
  reduce,
  className,
}: {
  entries: LogEntry[];
  verifiedOn: Record<string, string>;
  /** Reduced motion: lines fade in without growing. */
  reduce: boolean;
  className?: string;
}) {
  const shown = entries.filter((e) => !(e.kind === "stage" && e.status === "done" && !e.detail)).slice(-WINDOW);
  return (
    <ol aria-label="Research log, newest at the bottom" className={cn("absolute inset-x-0 bottom-0 px-2 pb-2.5", className)}>
      {shown.map((entry) => (
        <motion.li
          key={entry.key}
          initial={entry.live ? (reduce ? { opacity: 0 } : { opacity: 0, height: 0 }) : false}
          animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
          transition={{ duration: 0.26, ease: EASE }}
          className="overflow-hidden"
        >
          <Line entry={entry} verifiedOn={verifiedOn} />
        </motion.li>
      ))}
    </ol>
  );
}
