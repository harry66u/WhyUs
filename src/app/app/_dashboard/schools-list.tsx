"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/app/dialog";
import { RelativeTime } from "@/components/app/relative-time";
import { cn } from "@/components/ui/cn";
import { IconCheck, IconClock, IconTrash, IconX } from "@/components/ui/icons";
import { ProgressBar, UniquenessMeter } from "@/components/ui/meter";
import { LiveDot } from "@/components/ui/misc";
import { removeApplicationAction, rerunResearchAction } from "./actions";
import { type DashboardRow, isActiveStatus } from "./rows";

const POLL_MS = 2_000;
const SLOW_POLL_MS = 10_000;
/** Poll less often when nothing has changed for this long (a run may have stalled). */
const SLOW_AFTER_MS = 120_000;

const EASE = [0.22, 1, 0.36, 1] as const;

const GRID = "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1.2fr)_8.75rem_6.25rem_minmax(0,1.65fr)_2rem]";

function signature(rows: DashboardRow[]): string {
  return rows.map((r) => `${r.id}:${r.status}:${r.progress}:${r.updatedAt}:${r.uniquenessScore ?? ""}:${r.leadAngle ?? ""}`).join("|");
}

function describeChanges(prev: DashboardRow[], next: DashboardRow[]): string {
  const before = new Map(prev.map((r) => [r.id, r.status]));
  const messages: string[] = [];
  for (const r of next) {
    const was = before.get(r.id);
    if (!was || was === r.status) continue;
    if (r.status === "ready") messages.push(`${r.schoolName}: dossier ready.`);
    else if (r.status === "failed") messages.push(`${r.schoolName}: research stopped.`);
    else if (r.status === "researching" && was === "queued") messages.push(`${r.schoolName}: research started.`);
  }
  return messages.join(" ");
}

export function SchoolsList({ studentId, initialRows }: { studentId: string; initialRows: DashboardRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [announcement, setAnnouncement] = useState("");
  const [confirming, setConfirming] = useState<DashboardRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();
  const [rerunning, startRerun] = useTransition();
  const [rerunId, setRerunId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const rowsRef = useRef(initialRows);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const anyActive = rows.some((r) => isActiveStatus(r.status));

  useEffect(() => {
    if (!anyActive) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastChange = Date.now();
    let last = signature(rowsRef.current);
    const controller = new AbortController();

    const schedule = () => {
      if (!stopped) timer = setTimeout(tick, Date.now() - lastChange > SLOW_AFTER_MS ? SLOW_POLL_MS : POLL_MS);
    };
    async function tick() {
      if (document.visibilityState !== "hidden") {
        try {
          const res = await fetch(`/api/applications?studentId=${encodeURIComponent(studentId)}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (res.ok && !stopped) {
            const data = (await res.json()) as { applications: DashboardRow[] };
            const sig = signature(data.applications);
            if (sig !== last) {
              last = sig;
              lastChange = Date.now();
              const message = describeChanges(rowsRef.current, data.applications);
              if (message) setAnnouncement(message);
              setRows(data.applications);
            }
          }
        } catch {
          // Offline for a moment or aborted on unmount: try again on the next tick.
        }
      }
      schedule();
    }

    schedule();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [anyActive, studentId]);

  const confirmRemove = () => {
    const target = confirming;
    if (!target) return;
    setActionError(null);
    startRemove(async () => {
      const result = await removeApplicationAction(target.id);
      if (result.ok) {
        setRows((current) => current.filter((r) => r.id !== target.id));
        setAnnouncement(`Removed ${target.schoolName}.`);
        setConfirming(null);
      } else setActionError(result.message);
    });
  };

  const rerun = (row: DashboardRow) => {
    setActionError(null);
    setRerunId(row.id);
    startRerun(async () => {
      const result = await rerunResearchAction(row.id);
      if (result && !result.ok) setActionError(result.message);
      setRerunId(null);
    });
  };

  return (
    <div>
      {actionError && !confirming ? (
        <p className="mb-4 rounded-md bg-bad-wash px-3 py-2 text-sm text-bad" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className={cn("hidden gap-x-4 px-4 pb-2 text-2xs text-subtle lg:grid", GRID)} aria-hidden="true">
        <span>School</span>
        <span>Prompt</span>
        <span>Status</span>
        <span>Uniqueness</span>
        <span>Lead angle</span>
        <span />
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-lg bg-raised shadow-raise">
        <AnimatePresence>
          {rows.map((row, index) => (
            <motion.li
              key={row.id}
              layout={reduceMotion ? false : "position"}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.16 } }}
              transition={{ duration: 0.24, ease: EASE, delay: Math.min(index, 10) * 0.035, layout: { duration: 0.2, ease: EASE } }}
              className={cn("group relative grid gap-x-4 gap-y-3 px-4 py-4 transition-colors duration-150 hover:bg-hover lg:items-center lg:py-3.5", GRID)}
            >
              <div className="min-w-0 pr-10 lg:pr-0">
                <Link
                  href={row.href}
                  className="font-medium tracking-[-0.01em] text-fg after:absolute after:inset-0 after:content-['']"
                >
                  {row.schoolName}
                </Link>
                {row.unitName ? <p className="truncate text-xs text-muted">{row.unitName}</p> : null}
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm text-fg" title={row.promptTitle}>
                  <span className="sr-only">Prompt: </span>
                  {row.promptTitle}
                </p>
                <p className="tabular text-xs text-subtle">{row.wordLimit ? `${row.wordLimit} words` : "No word limit"}</p>
              </div>

              <div className="min-w-0">
                <StatusCell row={row} onRerun={() => rerun(row)} rerunning={rerunning && rerunId === row.id} />
              </div>

              <div className={cn(row.uniquenessScore === null && "max-lg:hidden")}>
                {row.uniquenessScore !== null ? (
                  <UniquenessMeter score={row.uniquenessScore} size="sm" label={`Uniqueness ${row.uniquenessScore} out of 100`} />
                ) : (
                  <span className="text-sm text-subtle">
                    <span aria-hidden="true">–</span>
                    <span className="sr-only">Not scored yet</span>
                  </span>
                )}
              </div>

              <div className={cn("min-w-0", !row.leadAngle && "max-lg:hidden")}>
                {row.leadAngle ? (
                  <p className="line-clamp-2 font-serif text-[0.975rem] leading-snug text-fg" title={row.leadAngle}>
                    <span className="sr-only">Lead angle: </span>
                    {row.leadAngle}
                  </p>
                ) : (
                  <span className="text-sm text-subtle">
                    <span aria-hidden="true">–</span>
                    <span className="sr-only">No lead angle yet</span>
                  </span>
                )}
              </div>

              <div className="absolute top-3 right-3 lg:static lg:justify-self-end">
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    setConfirming(row);
                  }}
                  className="relative z-10 grid h-8 w-8 place-items-center rounded-md text-subtle transition-colors hover:bg-hover hover:text-fg"
                  aria-label={`Remove ${row.schoolName}${row.unitName ? `, ${row.unitName}` : ""}`}
                  title="Remove school"
                >
                  <IconTrash />
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <ConfirmDialog
        open={confirming !== null}
        onCancel={() => {
          setConfirming(null);
          setActionError(null);
        }}
        onConfirm={confirmRemove}
        pending={removing}
        error={confirming ? actionError : null}
        title={confirming ? `Remove ${confirming.schoolName}?` : "Remove school?"}
        description={
          <>
            This deletes the research, dossier, and any share links for
            {confirming?.unitName ? ` ${confirming.unitName} at` : ""} {confirming?.schoolName ?? "this school"}. You can add the school again later.
          </>
        }
        confirmLabel="Remove school"
        pendingLabel="Removing…"
      />
    </div>
  );
}

function StatusCell({ row, onRerun, rerunning }: { row: DashboardRow; onRerun: () => void; rerunning: boolean }) {
  if (row.status === "queued" || row.status === "researching") {
    const live = row.status === "researching";
    return (
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-sm text-fg">
          {live ? <LiveDot /> : <IconClock size={14} className="text-subtle" />}
          <span>{live ? "Researching" : "Queued"}</span>
          {live ? <span className="tabular text-xs text-muted">{row.progress}%</span> : null}
        </p>
        <ProgressBar value={row.progress} className="max-w-[8rem]" />
      </div>
    );
  }
  if (row.status === "failed") {
    return (
      <div>
        <p className="flex items-center gap-1.5 text-sm text-bad">
          <IconX size={14} />
          <span>Failed</span>
        </p>
        <p className="line-clamp-2 text-xs text-muted" title={row.error ?? undefined}>
          {row.error ?? "Open it to see what happened and try again."}
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm text-fg">
        <IconCheck size={14} className="text-ok" />
        <span>Ready</span>
      </p>
      <p className="text-xs text-subtle">
        <RelativeTime iso={row.updatedAt} />
      </p>
      {row.profileChangedSinceResearch ? (
        <p className="mt-1 text-xs text-muted">
          Profile changed.{" "}
          <button
            type="button"
            onClick={onRerun}
            disabled={rerunning}
            className="relative z-10 text-fg underline decoration-line-strong underline-offset-[3px] transition-colors hover:decoration-accent-line disabled:opacity-50"
          >
            {rerunning ? "Starting…" : "Research again"}
          </button>
        </p>
      ) : null}
    </div>
  );
}
