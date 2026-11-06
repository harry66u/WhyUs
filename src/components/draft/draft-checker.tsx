"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { RelativeTime } from "@/components/app/relative-time";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { IconDraft } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/misc";
import { NEVER_REWRITES } from "@/lib/draft/messages";
import type { CheckedDraft } from "@/lib/draft/present";
import { countWords, MAX_DRAFT_CHARS, WORD_COUNT_RULE } from "@/lib/draft/text";
import { AnnotatedDraft, type NoteFilter } from "./annotated-draft";
import { DraftSummary } from "./draft-summary";

const EASE = [0.22, 1, 0.36, 1] as const;

interface Checked {
  text: string;
  result: CheckedDraft;
}

function isResult(data: unknown): data is CheckedDraft {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<CheckedDraft>;
  return typeof d.wordCount === "number" && Array.isArray(d.issues) && typeof d.summary === "object" && d.summary !== null;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** One sentence for screen readers when a check finishes. */
export function resultAnnouncement(r: CheckedDraft): string {
  const parts = [`${plural(r.summary.verifiedClaims, "fact")} confirmed`];
  if (r.summary.unverifiedClaims) parts.push(`${r.summary.unverifiedClaims} could not be confirmed`);
  const other = r.issues.filter((i) => i.type === "wrong_school").length;
  if (other) parts.push(`${plural(other, "mention")} of another school`);
  if (r.summary.swappableSentences) parts.push(plural(r.summary.swappableSentences, "swappable sentence"));
  if (r.summary.genericSentences) parts.push(plural(r.summary.genericSentences, "generic sentence"));
  const words = r.wordLimit ? `${r.wordCount} of ${r.wordLimit} words` : `${plural(r.wordCount, "word")}`;
  return `Check complete. ${words}. ${parts.join(", ")}.`;
}

export function DraftChecker({
  applicationId,
  schoolName,
  wordLimit,
  hasResearch,
  className,
}: {
  applicationId: string;
  /** Short name used in copy ("Dartmouth"). */
  schoolName: string;
  wordLimit: number | null;
  /** The school has a verified research base to check facts against. */
  hasResearch: boolean;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"edit" | "review">("edit");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [announcement, setAnnouncement] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const focusResults = useRef(false);
  const reduceMotion = useReducedMotion();
  const ids = useId();
  const draftId = `${ids}-draft`;
  const countId = `${ids}-count`;
  const statusId = `${ids}-status`;
  const ruleId = `${ids}-rule`;

  const words = useMemo(() => countWords(text), [text]);
  const over = wordLimit ? words - wordLimit : 0;
  const tooLong = text.length > MAX_DRAFT_CHARS;
  const stale = checked !== null && checked.text !== text;
  const canCheck = text.trim().length > 0 && !tooLong && !checking;

  // Announce crossing the word limit (not every keystroke).
  const wasOver = useRef(false);
  useEffect(() => {
    if (!wordLimit) return;
    const isOver = words > wordLimit;
    if (isOver !== wasOver.current) {
      wasOver.current = isOver;
      setAnnouncement(isOver ? `Over the ${wordLimit}-word limit.` : `Within the ${wordLimit}-word limit.`);
    }
  }, [words, wordLimit]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (mode === "review" && focusResults.current) {
      focusResults.current = false;
      headingRef.current?.focus();
    }
  }, [mode]);

  async function runCheck() {
    if (!canCheck) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const submitted = text;
    setChecking(true);
    setError(null);
    setAnnouncement("Checking the draft.");
    try {
      const res = await fetch("/api/draft/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, text: submitted }),
        cache: "no-store",
        signal: controller.signal,
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok || !isResult(data)) {
        const message =
          data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : res.status === 401
              ? "Your session ended. Sign in again, then check the draft."
              : "The draft could not be checked right now. Try again in a minute.";
        setError(message);
        setAnnouncement("");
        return;
      }
      setChecked({ text: submitted, result: data });
      setFilter("all");
      focusResults.current = true;
      setMode("review");
      setAnnouncement(resultAnnouncement(data));
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setError("WhyUs could not be reached. Check your connection and try again.");
      setAnnouncement("");
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setChecking(false);
      }
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runCheck();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void runCheck();
    }
  };

  const editDraft = () => {
    setMode("edit");
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const attention = checked ? checked.result.issues.filter((i) => i.range && i.type !== "verified_claim").length : 0;

  return (
    <div className={className}>
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>

      {!hasResearch ? (
        <p className="mb-6 max-w-[68ch] rounded-md bg-hover px-4 py-3 text-sm text-muted">
          WhyUs has no verified research on {schoolName} yet, so school facts in a draft cannot be confirmed. Word count, mentions of
          your other schools, and generic sentences are still checked.
        </p>
      ) : null}

      {mode === "edit" || !checked ? (
        <form onSubmit={onSubmit} aria-busy={checking || undefined} className="grid items-start gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
          <div className="min-w-0 lg:max-w-[44rem]">
            <label htmlFor={draftId} className="text-sm font-medium text-fg">
              Your draft
            </label>
            <textarea
              ref={textareaRef}
              id={draftId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              readOnly={checking}
              aria-describedby={`${countId} ${statusId} ${ruleId}`}
              aria-invalid={tooLong || undefined}
              placeholder="Paste your draft here."
              spellCheck
              className="mt-2 block min-h-[22rem] w-full resize-y rounded-lg bg-sunken px-5 py-4 font-serif text-[1.0625rem]/[1.8] text-fg shadow-[0_0_0_1px_var(--line)] transition-shadow duration-150 [field-sizing:content] placeholder:text-subtle hover:shadow-[0_0_0_1px_var(--line-strong)] focus:shadow-[0_0_0_1px_var(--accent-line),0_0_0_4px_var(--accent-wash)] focus:outline-none focus-visible:outline-none aria-[invalid=true]:shadow-[0_0_0_1px_var(--bad)] sm:px-6 sm:py-5 [font-optical-sizing:auto]"
            />
            {wordLimit ? (
              <span aria-hidden="true" className="mt-2 block h-[2px] w-full overflow-hidden rounded-full bg-line">
                <span
                  className={cn("block h-full rounded-full transition-[width] duration-300 ease-out", over > 0 ? "bg-bad" : "bg-subtle")}
                  style={{ width: `${Math.min(100, (words / wordLimit) * 100)}%` }}
                />
              </span>
            ) : null}
          </div>

          <div className="lg:sticky lg:top-8 lg:pt-7">
            <p className="text-xs text-subtle">Word count</p>
            <p id={countId} className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
              <span className={cn("tabular", over > 0 ? "text-bad" : "text-fg")}>{words}</span>
              {wordLimit ? <span className="tabular text-lg font-normal tracking-normal text-subtle"> / {wordLimit}</span> : null}
              <span className="sr-only"> words</span>
            </p>
            <p id={statusId} className={cn("mt-1 text-xs", over > 0 ? "text-bad" : "text-muted")}>
              {!wordLimit
                ? "No word limit for this prompt"
                : over > 0
                  ? `${over} over the ${wordLimit}-word limit`
                  : over === 0
                    ? "Exactly at the limit"
                    : `${-over} left before the limit`}
            </p>
            <p id={ruleId} className="mt-3 text-xs leading-relaxed text-subtle">
              {WORD_COUNT_RULE}
            </p>

            {error ? (
              <p role="alert" className="mt-4 rounded-md bg-bad-wash px-3 py-2 text-sm text-bad">
                {error}
              </p>
            ) : null}
            {tooLong ? (
              <p role="alert" className="mt-4 rounded-md bg-bad-wash px-3 py-2 text-sm text-bad">
                This draft is longer than {MAX_DRAFT_CHARS.toLocaleString("en-US")} characters. Check one essay at a time.
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Button type="submit" variant="primary" disabled={!canCheck} aria-keyshortcuts="Control+Enter Meta+Enter" className="sm:min-w-40 lg:w-full">
                {checking ? (
                  <>
                    <Spinner className="text-accent-fg" />
                    Checking draft
                  </>
                ) : checked && stale ? (
                  "Check again"
                ) : (
                  "Check draft"
                )}
              </Button>
              {checked && !stale ? (
                <Button variant="ghost" onClick={() => setMode("review")} className="lg:w-full">
                  Back to results
                </Button>
              ) : null}
            </div>
            {checked && stale ? <p className="mt-2 text-xs text-muted">The draft has changed since the last check.</p> : null}
            <p className="mt-4 text-xs leading-relaxed text-subtle">Drafts are checked and discarded. WhyUs does not store them.</p>
            <p className="mt-5 border-t border-line pt-4 text-sm text-muted">{NEVER_REWRITES}</p>
          </div>
        </form>
      ) : (
        <motion.section
          aria-labelledby={`${ids}-results`}
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: EASE }}
        >
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <h2 id={`${ids}-results`} ref={headingRef} tabIndex={-1} className="text-lg font-semibold tracking-[-0.015em] text-fg focus-visible:outline-offset-4">
                Check results
              </h2>
              <p className="mt-1 text-xs text-subtle">
                Checked <RelativeTime iso={checked.result.checkedAt} />. {plural(checked.result.summary.sentences, "sentence")},{" "}
                {attention === 0 ? "nothing flagged." : `${plural(attention, "note")} to look at.`}
              </p>
            </div>
            <Button variant="secondary" onClick={editDraft}>
              <IconDraft />
              Edit draft
            </Button>
          </div>

          <DraftSummary className="mt-6" result={checked.result} />

          <p className="mt-6 border-l-2 border-line-strong pl-3 text-sm text-muted">{NEVER_REWRITES}</p>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-fg">Your draft, with notes</h3>
            <div role="group" aria-label="Notes to show" className="inline-flex rounded-md bg-sunken p-0.5 shadow-[0_0_0_1px_var(--line)]">
              {(
                [
                  ["all", "All notes"],
                  ["attention", "Needs attention"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "h-7 rounded-[5px] px-2.5 text-xs transition-colors duration-150",
                    filter === value ? "bg-raised text-fg shadow-raise" : "text-muted hover:text-fg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <AnnotatedDraft className="mt-5" text={checked.text} issues={checked.result.issues} filter={filter} />
        </motion.section>
      )}
    </div>
  );
}
