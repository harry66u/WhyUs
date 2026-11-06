"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { highlightOf, layoutParagraphs, needsAttention, numberIssues, type HighlightStyle, type NumberedIssue } from "@/lib/draft/present";
import { segmentDraft } from "@/lib/draft/text";
import type { DraftIssue } from "@/lib/types";
import { DraftNote } from "./draft-note";
import { markClasses } from "./styles";

export type NoteFilter = "all" | "attention";

/** Space between stacked margin notes, and how far a note sits above its line's text box. */
const NOTE_GAP = 8;
const NOTE_NUDGE = 6;

function sameOffsets(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1);
}

/**
 * The checked draft with highlights in place and one margin note per flag.
 * Desktop: notes sit in a right-hand rail, each aligned with the line it is
 * about. Narrow screens: a paragraph's notes follow it. Hovering or focusing a
 * note outlines its words; clicking highlighted words brings up their note.
 */
export function AnnotatedDraft({ text, issues, filter, className }: { text: string; issues: DraftIssue[]; filter: NoteFilter; className?: string }) {
  const numbered = useMemo(() => numberIssues(issues), [issues]);
  const views = useMemo(() => layoutParagraphs(text, segmentDraft(text).paragraphs, numbered), [text, numbered]);
  const byId = useMemo(() => new Map(numbered.map((i) => [i.id, i])), [numbered]);
  const [active, setActive] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const prefix = `draft${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const reduceMotion = useReducedMotion();

  const shown = useCallback((i: NumberedIssue) => filter === "all" || needsAttention(i), [filter]);
  const noteDomId = useCallback((id: string) => `${prefix}-note-${id}`, [prefix]);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const next: Record<string, number> = {};
    for (const para of root.querySelectorAll<HTMLElement>("[data-draft-paragraph]")) {
      const textEl = para.querySelector<HTMLElement>("[data-draft-text]");
      const list = para.querySelector<HTMLElement>("[data-draft-notes]");
      if (!textEl || !list) continue;
      const t = textEl.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      const beside = l.left >= t.right - 1;
      let y = 0;
      let first = true;
      for (const item of list.querySelectorAll<HTMLElement>("[data-note-id]")) {
        const id = item.dataset.noteId ?? "";
        if (!beside) continue;
        const mark = textEl.querySelector<HTMLElement>(`[data-issue-ids~="${id}"]`);
        const desired = mark ? Math.max(0, mark.getBoundingClientRect().top - t.top - NOTE_NUDGE) : y;
        const top = Math.max(desired, first ? 0 : y + NOTE_GAP);
        next[id] = Math.round(top - y);
        y = top + item.offsetHeight;
        first = false;
      }
    }
    setOffsets((prev) => (sameOffsets(prev, next) ? prev : next));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, views, filter]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(root);
    document.fonts?.ready.then(schedule).catch(() => undefined);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [measure]);

  /** Clicking highlighted words: the innermost note that is shown (a claim before its sentence). */
  const openNote = (ids: string[]) => {
    const target = [...ids].reverse().find((id) => {
      const issue = byId.get(id);
      return issue ? shown(issue) : false;
    });
    if (!target) return;
    setActive(target);
    const el = document.getElementById(noteDomId(target));
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
      el.focus({ preventScroll: true });
    }
  };

  return (
    <div ref={rootRef} className={cn("space-y-7", className)}>
      {views.map((view) => {
        const notes = view.notes.filter(shown);
        return (
          <div
            key={view.paragraph.index}
            data-draft-paragraph=""
            className="grid items-start gap-x-12 gap-y-3 lg:grid-cols-[minmax(0,1fr)_17.5rem]"
          >
            <p data-draft-text="" className="min-w-0 font-serif text-[1.0625rem]/[1.9] break-words whitespace-pre-wrap text-fg [font-optical-sizing:auto]">
              {view.segments.map((seg) => {
                if (seg.issueIds.length === 0) return <span key={seg.start}>{seg.text}</span>;
                const styles = new Set(
                  seg.issueIds
                    .map((id) => byId.get(id))
                    .filter((i): i is NumberedIssue => Boolean(i))
                    .map((i) => highlightOf(i))
                    .filter((s): s is HighlightStyle => s !== null),
                );
                const isActive = active !== null && seg.issueIds.includes(active);
                return (
                  <mark
                    key={seg.start}
                    data-issue-ids={seg.issueIds.join(" ")}
                    data-active={isActive || undefined}
                    onClick={() => openNote(seg.issueIds)}
                    className={cn(markClasses(styles, isActive), "cursor-pointer")}
                  >
                    {seg.text}
                  </mark>
                );
              })}
            </p>
            {notes.length > 0 ? (
              <ol data-draft-notes="" role="list" aria-label={`Notes on paragraph ${view.paragraph.index + 1}`} className="min-w-0 border-l border-line pl-4 lg:border-l-0 lg:pl-0">
                {notes.map((issue) => (
                  <li
                    key={issue.id}
                    data-note-id={issue.id}
                    style={offsets[issue.id] !== undefined ? { marginTop: offsets[issue.id] } : undefined}
                    className="[&:not(:first-child)]:mt-2"
                  >
                    <DraftNote issue={issue} domId={noteDomId(issue.id)} active={active === issue.id} onActivate={setActive} />
                  </li>
                ))}
              </ol>
            ) : (
              <div aria-hidden="true" className="hidden lg:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}
