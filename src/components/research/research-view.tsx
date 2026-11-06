"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { IconArrowLeft, IconCheck, IconClock, IconX } from "@/components/ui/icons";
import { LiveDot } from "@/components/ui/misc";
import { CounterStrip } from "./counters";
import { DossierForming } from "./dossier-forming";
import { LiveLog } from "./live-log";
import { StageTrack } from "./stage-track";
import type { ResearchViewProps } from "./types";
import { useResearchRun } from "./use-research-run";

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function spoken(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m} minute${m === 1 ? "" : "s"} ${r} second${r === 1 ? "" : "s"}` : `${r} second${r === 1 ? "" : "s"}`;
}

/** The current time, ticking once a second while `active` (null until mounted, so server and client render alike). */
function useNow(active: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = active ? setInterval(tick, 1000) : undefined;
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [active]);
  return now;
}

function Elapsed({ startedAt, finishedAt, running }: { startedAt?: string; finishedAt?: string | null; running: boolean }) {
  const now = useNow(running);
  if (!startedAt || now === null) return null;
  const end = finishedAt ? Date.parse(finishedAt) : now;
  const ms = Math.max(0, end - Date.parse(startedAt));
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted" title={running ? "Time since research started" : "Time the research took"}>
      <IconClock size={14} className="text-subtle" />
      <span className="sr-only">{running ? "Elapsed" : "Took"} {spoken(ms)}</span>
      <span className="tabular text-fg" aria-hidden="true">
        {mmss(ms)}
      </span>
    </span>
  );
}

export function ResearchView(props: ResearchViewProps) {
  const router = useRouter();
  const { state, connection, start, starting, startError } = useResearchRun(props.applicationId, props.initialRun);
  const run = state.run;
  const failed = Boolean(state.error) || run?.status === "failed";
  const done = !failed && (Boolean(state.done) || run?.status === "done");
  const running = !failed && !done;
  const finalFresh = props.final && (!state.done || props.final.dossierId === state.done.dossierId) ? props.final : null;

  // When the run finishes live, fetch the finished dossier (server props) so the list settles into its final ranking.
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    const id = state.done?.dossierId;
    if (!id || refreshed.current === id || props.final?.dossierId === id) return;
    refreshed.current = id;
    router.refresh();
  }, [state.done, props.final, router]);

  const status = failed ? (
    <Badge tone="bad">
      <IconX size={12} />
      Stopped
    </Badge>
  ) : done ? (
    <Badge tone="ok">
      <IconCheck size={12} />
      Ready
    </Badge>
  ) : (
    <Badge tone="accent">
      <LiveDot />
      Researching
    </Badge>
  );

  const detailCount = finalFresh?.details.length;

  return (
    <div className="pb-16">
      <Link href="/app" className="inline-flex items-center gap-1.5 rounded-xs text-xs text-muted transition-colors hover:text-fg">
        <IconArrowLeft size={14} />
        Schools
      </Link>

      <header className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-[46rem]">
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-fg">{props.schoolName}</h1>
          {props.unitName ? <p className="mt-1 text-md text-muted">{props.unitName}</p> : null}
          <figure className="mt-6">
            <blockquote className={props.prompt.text.length > 420 ? "font-serif text-md leading-relaxed text-fg" : "font-serif text-lg leading-relaxed text-fg"}>
              “{props.prompt.text}”
            </blockquote>
            <figcaption className="mt-2 text-xs text-subtle">
              {props.prompt.wordLimit ? `Up to ${props.prompt.wordLimit} words` : "No word limit given"}
            </figcaption>
          </figure>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {status}
          <Elapsed startedAt={run?.startedAt} finishedAt={run?.finishedAt} running={running && Boolean(run)} />
        </div>
      </header>

      {done ? (
        <div className="mt-8 flex flex-col gap-4 rounded-lg bg-raised px-5 py-4 shadow-raise sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ok-wash text-ok" aria-hidden="true">
              <IconCheck />
            </span>
            <div>
              <p className="text-sm font-medium text-fg">Dossier ready</p>
              <p className="mt-0.5 text-xs text-muted">
                {detailCount ? `${detailCount} verified details` : `${state.counters.factsVerified} facts verified`}
                {state.done ? `, uniqueness ${state.done.uniquenessScore}` : finalFresh ? `, uniqueness ${Math.round(finalFresh.uniquenessScore)}` : ""}. The full research
                log is below.
              </p>
            </div>
          </div>
          <ButtonLink href={props.dossierHref} variant="primary" size="lg" className="w-full sm:w-auto">
            Open dossier
          </ButtonLink>
        </div>
      ) : null}

      {failed || startError ? (
        <div role="alert" className="mt-8 flex flex-col gap-4 rounded-lg bg-raised px-5 py-4 shadow-raise sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bad-wash text-bad" aria-hidden="true">
              <IconX />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg">{startError && !failed ? "Research did not start" : "Research stopped"}</p>
              <p className="mt-0.5 max-w-2xl text-xs text-muted">{startError ?? state.error ?? "The run ended before a dossier was ready."}</p>
            </div>
          </div>
          <Button variant="primary" size="lg" onClick={() => void start(true)} disabled={starting} className="w-full sm:w-auto">
            {starting ? "Starting" : "Try again"}
          </Button>
        </div>
      ) : null}

      <div className="mt-10">
        <StageTrack stages={state.stages} />
      </div>

      <div className="mt-8">
        <CounterStrip counters={state.counters} />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <LiveLog
          entries={state.entries}
          startedAt={run?.startedAt}
          connection={connection}
          runStatus={failed ? "failed" : done ? "done" : run ? "running" : null}
          schoolShortName={props.schoolShortName}
        />
        <DossierForming state={state} final={finalFresh} running={running} />
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {state.announcement}
      </p>
    </div>
  );
}
