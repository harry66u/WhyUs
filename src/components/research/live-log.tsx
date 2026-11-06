"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { IconBlocked, IconCheck, IconChevronDown, IconMatch, IconPage, IconQuote, IconSwap, IconX } from "@/components/ui/icons";
import { LiveDot, Spinner } from "@/components/ui/misc";
import { kindLabel } from "@/lib/format";
import { offsetLabel, swapSummary, type LogEntry } from "./state";
import type { ConnectionState } from "./use-research-run";

const EASE = [0.22, 1, 0.36, 1] as const;

function HostChip({ host }: { host: string }) {
  return (
    <span className="inline-flex h-5 max-w-[16rem] shrink-0 items-center truncate rounded-xs bg-hover px-1.5 text-2xs text-muted shadow-[inset_0_0_0_1px_var(--line)]">
      {host}
    </span>
  );
}

function Glyph({ entry }: { entry: LogEntry }) {
  switch (entry.kind) {
    case "page":
      if (entry.status === "reading") return <LiveDot />;
      if (entry.status === "blocked") return <IconBlocked size={14} className="text-bad" />;
      if (entry.status === "failed") return <IconX size={14} className="text-bad" />;
      return <IconPage size={14} className={entry.status === "cached" ? "text-info" : "text-subtle"} />;
    case "fact":
      return entry.status === "verified" ? <IconCheck size={14} className="text-ok" /> : <IconX size={14} className="text-bad" />;
    case "match":
      return <IconMatch size={14} className="text-info" />;
    case "swap":
      return <IconSwap size={14} className="text-info" />;
    case "angle":
      return <IconQuote size={14} className={entry.isLead ? "text-muted" : "text-subtle"} />;
    case "done":
      return <IconCheck size={14} className="text-ok" />;
    case "error":
      return <IconX size={14} className="text-bad" />;
    case "log":
      return <span className="mx-auto mt-[5px] block h-1 w-1 rounded-full bg-line-strong" />;
    default:
      return null;
  }
}

function pageStatusWord(status: Extract<LogEntry, { kind: "page" }>["status"]): string {
  switch (status) {
    case "reading":
      return "Reading";
    case "read":
      return "Read";
    case "cached":
      return "Read";
    case "blocked":
      return "Blocked";
    case "failed":
      return "Could not read";
  }
}

function FactLine({ entry }: { entry: Extract<LogEntry, { kind: "fact" }> }) {
  const [open, setOpen] = useState(false);
  const quoteId = useId();
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={entry.status === "verified" ? "text-ok" : "text-bad"}>{entry.status === "verified" ? "Verified" : "Rejected"}</span>
        <span className="min-w-0 font-medium text-fg">{entry.title}</span>
        <span className="text-subtle">{kindLabel(entry.factKind)}</span>
      </p>
      {entry.status === "rejected" && entry.reason ? <p className="mt-0.5 text-muted">{entry.reason}</p> : null}
      {entry.status === "verified" && entry.quote ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={quoteId}
            className="mt-1 inline-flex items-center gap-1 rounded-xs text-2xs text-muted transition-colors hover:text-fg"
          >
            <IconChevronDown size={12} className={cn("transition-transform duration-150", open && "rotate-180")} />
            {open ? "Hide quote" : "Show the quote found on the page"}
          </button>
          <blockquote
            id={quoteId}
            hidden={!open}
            className="mt-2 border-l-2 border-line-strong pl-3 font-serif text-[0.95rem] leading-relaxed text-muted"
          >
            “{entry.quote}”
          </blockquote>
        </>
      ) : null}
    </div>
  );
}

function Content({ entry }: { entry: LogEntry }): ReactNode {
  switch (entry.kind) {
    case "page":
      return (
        <div className="min-w-0">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <HostChip host={entry.host} />
            <span className={cn("shrink-0", entry.status === "blocked" || entry.status === "failed" ? "text-bad" : "text-muted")}>{pageStatusWord(entry.status)}</span>
            <span className="min-w-0 truncate text-fg" title={entry.url}>
              {entry.title || entry.path}
            </span>
            {entry.ms && entry.status === "read" ? <span className="tabular text-subtle">{(entry.ms / 1000).toFixed(1)} s</span> : null}
          </p>
          {entry.reason ? (
            <p className={cn("mt-0.5", entry.status === "blocked" || entry.status === "failed" ? "text-muted" : "text-subtle")}>
              {entry.status === "blocked" || entry.status === "failed" ? `${entry.host} ${entry.reason}` : entry.reason}
            </p>
          ) : null}
        </div>
      );
    case "fact":
      return <FactLine entry={entry} />;
    case "match":
      return (
        <div className="min-w-0">
          <p>
            <span className="text-muted">Matched </span>
            <span className="font-medium text-fg">{entry.title}</span>
            {entry.activityTitle ? (
              <>
                <span className="text-muted"> to </span>
                <span className="text-fg">{entry.activityTitle}</span>
              </>
            ) : null}
          </p>
          {entry.sentence ? <p className="mt-1 font-serif text-[0.95rem] leading-relaxed text-muted">{entry.sentence}</p> : null}
        </div>
      );
    case "swap":
      return (
        <div className="min-w-0">
          <p>
            <span className="text-muted">Swap test for </span>
            <span className="font-medium text-fg">{entry.title}</span>
          </p>
          {entry.results.length ? <p className="mt-0.5 text-muted">{swapSummary(entry.results)}</p> : null}
        </div>
      );
    case "angle":
      return (
        <div className="min-w-0">
          <p className="text-muted">{entry.isLead ? "Lead angle" : "Angle"}</p>
          <p className="mt-0.5 font-serif text-[0.95rem] leading-relaxed text-fg">{entry.line}</p>
        </div>
      );
    case "log":
      return <p className="text-muted">{entry.message}</p>;
    case "done":
      return (
        <p className="text-fg">
          Dossier assembled. Uniqueness <span className="tabular">{entry.uniquenessScore}</span>.
        </p>
      );
    case "error":
      return <p className="text-bad">{entry.message}</p>;
    default:
      return null;
  }
}

function StageRow({ entry, offset }: { entry: Extract<LogEntry, { kind: "stage" }>; offset: string }) {
  if (entry.status === "start") {
    return (
      <div className="flex items-center gap-2.5 px-2 pb-1 pt-4">
        <span className="w-[3.25rem] shrink-0 text-2xs tabular text-subtle">{offset}</span>
        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[0.625rem] font-semibold tabular text-subtle shadow-[inset_0_0_0_1px_var(--line-strong)]">
          {entry.index}
        </span>
        <span className="text-xs font-medium text-fg">{entry.label}</span>
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </div>
    );
  }
  if (!entry.detail) return null;
  return (
    <div className="grid grid-cols-[3.25rem_1rem_minmax(0,1fr)] items-start gap-x-2.5 rounded-md px-2 py-1.5 text-xs">
      <span className="pt-px text-2xs tabular text-subtle">{offset}</span>
      <span className="pt-0.5">
        <IconCheck size={14} className="text-ok" />
      </span>
      <p className="text-muted">{entry.detail}</p>
    </div>
  );
}

function connectionLabel(connection: ConnectionState, status: "running" | "done" | "failed" | null): { text: string; live: boolean; busy: boolean } {
  if (status === "done") return { text: "Complete", live: false, busy: false };
  if (status === "failed") return { text: "Stopped", live: false, busy: false };
  if (connection === "reconnecting") return { text: "Reconnecting", live: false, busy: true };
  if (connection === "live") return { text: "Live", live: true, busy: false };
  if (connection === "ended") return { text: "Complete", live: false, busy: false };
  return { text: "Connecting", live: false, busy: true };
}

export function LiveLog({
  entries,
  startedAt,
  connection,
  runStatus,
  schoolShortName,
}: {
  entries: LogEntry[];
  startedAt: string | undefined;
  connection: ConnectionState;
  runStatus: "running" | "done" | "failed" | null;
  schoolShortName: string;
}) {
  const reduce = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    followingRef.current = atBottom;
    setFollowing(atBottom);
  }, []);

  const jump = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
    followingRef.current = true;
    setFollowing(true);
  }, [reduce]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && followingRef.current) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  // Keep the newest line in view while a quote expands at the bottom.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (followingRef.current) el.scrollTop = el.scrollHeight;
    });
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  const label = connectionLabel(connection, runStatus);

  return (
    <section aria-labelledby="live-log-heading" className="relative flex min-w-0 flex-col rounded-lg bg-sunken shadow-[0_0_0_1px_var(--line)]">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 id="live-log-heading" className="text-sm font-medium text-fg">
          Live log
        </h2>
        <span className="inline-flex items-center gap-2 text-2xs text-muted">
          {label.live ? <LiveDot /> : label.busy ? <Spinner /> : null}
          {label.text}
        </span>
      </header>

      <div
        ref={scroller}
        onScroll={onScroll}
        tabIndex={0}
        aria-label="Research log, newest at the bottom"
        className="h-[min(60vh,560px)] overflow-y-auto overscroll-contain px-2 py-2 focus-visible:rounded-none lg:h-[min(68vh,680px)]"
      >
        <ol className="pb-2">
          {entries.length === 0 ? (
            <li className="flex items-center gap-2.5 px-2 py-6 text-xs text-muted">
              {runStatus === "failed" ? (
                "No research events were recorded for this run."
              ) : (
                <>
                  <Spinner />
                  Starting research
                </>
              )}
            </li>
          ) : null}
          {entries.map((entry) => {
            if (entry.kind === "stage" && entry.status === "done" && !entry.detail) return null;
            const offset = offsetLabel(startedAt, entry.ts);
            const initial = entry.live ? (reduce ? { opacity: 0 } : { opacity: 0, y: 6 }) : false;
            return (
              <motion.li key={entry.key} initial={initial} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE }}>
                {entry.kind === "stage" ? (
                  <StageRow entry={entry} offset={offset} />
                ) : (
                  <div className="grid grid-cols-[3.25rem_1rem_minmax(0,1fr)] items-start gap-x-2.5 rounded-md px-2 py-1.5 text-xs leading-[1.35rem] transition-colors duration-150 hover:bg-hover">
                    <span className="text-2xs tabular leading-[1.35rem] text-subtle">{offset}</span>
                    <span className="flex h-[1.35rem] items-center justify-center">
                      <Glyph entry={entry} />
                    </span>
                    <Content entry={entry} />
                  </div>
                )}
              </motion.li>
            );
          })}
        </ol>
      </div>

      {!following ? (
        <button
          type="button"
          onClick={jump}
          className="absolute bottom-14 left-1/2 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-overlay px-3 text-xs text-fg shadow-pop transition-colors hover:bg-raised"
        >
          <IconChevronDown size={13} />
          Jump to latest
        </button>
      ) : null}

      <footer className="border-t border-line px-4 py-2.5 text-2xs text-subtle">
        Official {schoolShortName} pages only. A fact enters the dossier only if its quoted text is on the current page.
      </footer>
    </section>
  );
}
