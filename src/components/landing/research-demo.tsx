"use client";

import { useInView } from "motion/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent, type PointerEvent } from "react";
import { TickingNumber } from "@/components/research/counters";
import { StageTrack } from "@/components/research/stage-track";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { IconCheck } from "@/components/ui/icons";
import { LiveDot } from "@/components/ui/misc";
import { DemoDossier } from "./demo-dossier";
import { DemoLog } from "./demo-log";
import { FADE_MS, HOLD_MS, initialCount, replaySchedule, replayState, toStoredEvents } from "./demo-script";
import { IconPause, IconPlay, IconReplay } from "./icons";
import type { DemoView } from "./types";

/* ------------------------------------------------------------------ */
/* Hydration-safe media and visibility (server and first paint: false/true) */
/* ------------------------------------------------------------------ */

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
}

function usePageVisible(): boolean {
  return useSyncExternalStore(subscribeVisibility, () => document.visibilityState !== "hidden", () => true);
}

function word(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * The landing page's signature moment: a replay of a research run, from the
 * prompt's scope to an assembled dossier, built from verified research data.
 *
 * - Plays when it scrolls into view and loops after holding the finished
 *   dossier; pauses while the pointer is over it or focus is inside it, while
 *   it is off screen, and while the tab is hidden.
 * - A pause button stops it until the visitor plays it again (play also
 *   overrides a hover or focus pause).
 * - With reduced motion it shows the finished dossier and plays only on request,
 *   with fades instead of movement.
 * - Stage changes are announced politely during the first pass.
 */
export function ResearchDemo({ demo, className }: { demo: DemoView; className?: string }) {
  const stored = useMemo(() => toStoredEvents(demo.events), [demo.events]);
  const schedule = useMemo(() => replaySchedule(demo.events), [demo.events]);
  const total = stored.length;
  const start = useMemo(() => initialCount(demo.events), [demo.events]);

  const [shownCount, setShownCount] = useState(start);
  const [liveFrom, setLiveFrom] = useState(start);
  /** The visitor pressed play (with reduced motion, the replay only runs after this). */
  const [played, setPlayed] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  /** Set by pressing play while hovering or focused, so the replay runs anyway; cleared when both leave. */
  const [override, setOverride] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [fading, setFading] = useState(false);
  const [announce, setAnnounce] = useState(true);

  const titleId = useId();
  const logHeadingId = useId();
  const reduce = usePrefersReducedMotion();
  const pageVisible = usePageVisible();
  const rootRef = useRef<HTMLElement>(null);
  const inView = useInView(rootRef, { amount: 0.2 });

  /** Reduced motion and not asked to play: the finished dossier, standing still. */
  const still = reduce && !played;
  const frameCount = still ? total : shownCount;
  const frameLive = still ? total : liveFrom;
  const finished = frameCount >= total;
  const heldBack = userPaused || (!override && (hovering || focused));
  const playing = !still && !heldBack && inView && pageVisible;

  const state = useMemo(() => replayState(stored, frameCount, frameLive), [stored, frameCount, frameLive]);

  // Advance one event at a time; hold the finished dossier, then fade and start over.
  useEffect(() => {
    if (!playing || fading) return;
    if (shownCount >= total) {
      if (reduce) return; // a requested replay with reduced motion stops at the finished dossier
      const hold = window.setTimeout(() => setFading(true), HOLD_MS);
      return () => window.clearTimeout(hold);
    }
    const next = window.setTimeout(() => setShownCount((n) => Math.min(total, n + 1)), schedule[shownCount]);
    return () => window.clearTimeout(next);
  }, [playing, fading, shownCount, total, schedule, reduce]);

  useEffect(() => {
    if (!fading || !playing) return;
    const reset = window.setTimeout(() => {
      setShownCount(0);
      setLiveFrom(0);
      setFading(false);
      setAnnounce(false); // later passes run silently
    }, FADE_MS);
    return () => window.clearTimeout(reset);
  }, [fading, playing]);

  const restart = useCallback(() => {
    setPlayed(true);
    setShownCount(0);
    setLiveFrom(0);
    setFading(false);
    setUserPaused(false);
    setOverride(true);
    setAnnounce(true);
  }, []);

  // The button is the visitor's explicit choice: "Pause" stops the replay until
  // they press "Play" (hover and focus pauses are transient and show only in
  // the status). "Play" also overrides a hover or focus pause.
  const onControl = () => {
    if (still || (reduce && finished)) {
      restart();
    } else if (userPaused) {
      setUserPaused(false);
      setOverride(true);
      setAnnounce(true);
    } else {
      setUserPaused(true);
      setOverride(false);
    }
  };

  const onPointerEnter = (e: PointerEvent) => {
    if (e.pointerType === "mouse") setHovering(true);
  };
  const onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    setHovering(false);
    if (!focused) setOverride(false);
  };
  const onFocus = () => setFocused(true);
  const onBlur = (e: FocusEvent) => {
    if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
    setFocused(false);
    if (!hovering) setOverride(false);
  };

  const control =
    still || (reduce && finished)
      ? { label: still ? "Play replay" : "Replay", aria: "Play the research replay from the start", icon: still ? <IconPlay size={14} /> : <IconReplay size={14} /> }
      : userPaused
        ? { label: "Play", aria: "Play the research replay", icon: <IconPlay size={14} /> }
        : { label: "Pause", aria: "Pause the research replay", icon: <IconPause size={14} /> };

  const status = finished ? (
    <Badge tone="ok">
      <IconCheck size={12} />
      Dossier ready
    </Badge>
  ) : heldBack ? (
    <Badge tone="neutral">Paused</Badge>
  ) : (
    <Badge tone="accent">
      <LiveDot />
      Replaying
    </Badge>
  );

  const stages = state.stages.map((s) => ({ ...s, detail: undefined }));
  const { counters } = state;
  const unitLabel = demo.unit ? (demo.unit.shortName ?? demo.unit.name) : null;
  const liveText = !still && announce && state.announcement ? `Research replay: ${state.announcement}` : "";
  const hiddenForLoop = fading && playing;

  return (
    <section
      ref={rootRef}
      id="demo"
      aria-labelledby={titleId}
      className={cn("scroll-mt-24", className)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="overflow-hidden rounded-lg bg-raised shadow-raise">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
              <span className="sr-only">Research replay: </span>
              <span className="font-medium text-fg">{demo.school.name}</span>
              {unitLabel ? <span className="text-muted">{unitLabel}</span> : null}
              {demo.source === "example" ? <Badge tone="outline">Example</Badge> : null}
            </h2>
            <p className="mt-1.5 max-w-[62ch] font-serif text-[0.975rem] leading-[1.45] text-pretty text-fg">
              <span aria-hidden="true">“</span>
              {demo.prompt.text}
              <span aria-hidden="true">”</span>
            </p>
            <p className="mt-1 text-2xs text-subtle tabular">
              {demo.prompt.wordLimit ? `${demo.prompt.wordLimit}-word limit` : "No word limit given"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {status}
            <Button variant="ghost" size="sm" onClick={onControl} aria-label={control.aria} className="gap-1.5">
              {control.icon}
              {control.label}
            </Button>
          </div>
        </div>

        {/* Everything that resets between passes fades out and back in together. */}
        <div className={cn("transition-opacity duration-[450ms] ease-out", hiddenForLoop ? "opacity-0" : "opacity-100")}>
          <div className="border-b border-line px-4 py-4 sm:px-5">
            <StageTrack stages={stages} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <section aria-labelledby={logHeadingId} className="flex min-w-0 flex-col border-b border-line bg-sunken lg:border-r lg:border-b-0">
              <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <h3 id={logHeadingId} className="text-sm font-medium text-fg">
                  Research log
                </h3>
                <span className="truncate text-2xs text-muted">
                  {demo.source === "example" ? "Fictional example data" : `Official ${demo.school.shortName} pages only`}
                </span>
              </header>
              <div className="relative h-52 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_1.25rem)] lg:h-auto lg:min-h-0 lg:flex-1">
                <DemoLog entries={state.entries} verifiedOn={demo.verifiedOn} reduce={reduce} />
              </div>
            </section>
            <DemoDossier demo={demo} state={state} reduce={reduce} />
          </div>

          <p className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line px-4 py-2.5 text-2xs text-muted sm:px-5">
            <span>
              <TickingNumber value={counters.pagesRead} className="text-fg" /> official {word(counters.pagesRead, "page", "pages")} read
            </span>
            <span>
              <TickingNumber value={counters.factsVerified} className="text-fg" /> {word(counters.factsVerified, "fact", "facts")} verified
            </span>
            <span>
              <TickingNumber value={counters.matches} className="text-fg" /> matched to the profile
            </span>
          </p>
        </div>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveText}
      </p>
    </section>
  );
}
