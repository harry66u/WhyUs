"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Textarea } from "@/components/ui/field";
import { IconPage, IconUpload, IconX } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/misc";
import type { ParseResponse } from "@/lib/profile/activities";
import type { Activity } from "@/lib/types";

const MAX_PDF_BYTES = 5 * 1024 * 1024;

const FORMAT_LABEL: Record<string, string> = {
  commonapp: "a Common App activities list",
  "commonapp-numbered": "a printed Common App activities list",
  resume: "a resume",
  list: "a list",
};

type Mode = "paste" | "upload";

function sizeLabel(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportPanel({
  existingCount,
  defaultOpen,
  onApply,
}: {
  existingCount: number;
  defaultOpen: boolean;
  onApply: (activities: Activity[], how: "merge" | "replace", sourceText: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mode, setMode] = useState<Mode>("paste");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmReplace, setConfirmReplace] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const ids = { text: useId(), file: useId(), status: useId(), heading: useId() };

  useEffect(() => () => controller.current?.abort(), []);

  const resetResult = () => {
    setResult(null);
    setSelected(new Set());
  };

  const pickFile = (f: File | null) => {
    setError(null);
    resetResult();
    if (!f) return setFile(null);
    if (!(f.type === "application/pdf" || /\.pdf$/i.test(f.name))) {
      setFile(null);
      return setError("Choose a PDF file, or paste the text instead.");
    }
    if (f.size > MAX_PDF_BYTES) {
      setFile(null);
      return setError("That file is larger than 5 MB. Export a smaller PDF or paste the text instead.");
    }
    setFile(f);
  };

  const read = async () => {
    setError(null);
    resetResult();
    const form = new FormData();
    if (mode === "paste") {
      if (!text.trim()) return setError("Paste your activities first.");
      form.set("text", text);
    } else {
      if (!file) return setError("Choose a PDF first.");
      form.set("file", file);
    }
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setBusy(true);
    try {
      const res = await fetch("/api/profile/parse", { method: "POST", body: form, signal: ac.signal });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message = data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : null;
        setError(message ?? "Your activities could not be read just now. Try again.");
        return;
      }
      const parsed = data as ParseResponse;
      setResult(parsed);
      setSelected(new Set(parsed.activities.map((a) => a.id)));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setError("The connection dropped. Check your network and try again.");
    } finally {
      if (controller.current === ac) setBusy(false);
    }
  };

  const apply = (how: "merge" | "replace") => {
    if (!result) return;
    onApply(
      result.activities.filter((a) => selected.has(a.id)),
      how,
      result.sourceText,
    );
    setConfirmReplace(false);
    resetResult();
    setText("");
    setFile(null);
    setOpen(false);
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!open) {
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-sunken px-4 py-3.5 shadow-[0_0_0_1px_var(--line)] sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">Import from your Common App activities section or a resume, as text or a PDF.</p>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <IconUpload size={14} />
          Import activities
        </Button>
      </div>
    );
  }

  const count = selected.size;

  return (
    <section aria-labelledby={ids.heading} className="rounded-lg bg-sunken p-4 shadow-[0_0_0_1px_var(--line)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={ids.heading} className="text-sm font-medium text-fg">
            Import activities
          </h3>
          <p className="mt-0.5 text-sm text-muted">Every activity comes from your text, word for word. Review the list before adding it.</p>
        </div>
        {existingCount > 0 || result ? (
          <button
            type="button"
            onClick={() => {
              controller.current?.abort();
              setBusy(false);
              setError(null);
              resetResult();
              setOpen(false);
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-subtle transition-colors hover:bg-hover hover:text-fg"
            aria-label="Close import"
          >
            <IconX />
          </button>
        ) : null}
      </div>

      {!result ? (
        <div className="mt-4 space-y-4">
          <fieldset>
            <legend className="sr-only">Import from</legend>
            <div className="inline-flex rounded-md bg-canvas p-0.5 shadow-[0_0_0_1px_var(--line)]">
              {(
                [
                  ["paste", "Paste text"],
                  ["upload", "Upload a PDF"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "cursor-pointer rounded-sm px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]",
                    mode === value ? "bg-raised text-fg shadow-raise" : "text-muted hover:text-fg",
                  )}
                >
                  <input
                    type="radio"
                    name="import-mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => {
                      setMode(value);
                      setError(null);
                    }}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {mode === "paste" ? (
            <div className="space-y-1.5">
              <label htmlFor={ids.text} className="sr-only">
                Activities text
              </label>
              <Textarea
                id={ids.text}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder="Paste the activities section of your Common App, or the activity sections of your resume."
                aria-describedby={ids.status}
              />
            </div>
          ) : (
            <div>
              <label
                htmlFor={ids.file}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pickFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]",
                  dragging ? "border-line-strong bg-hover" : "border-line-strong bg-canvas hover:bg-hover",
                )}
              >
                <IconUpload className="text-subtle" />
                <span className="text-sm text-fg">{file ? "Choose a different PDF" : "Choose a PDF or drop it here"}</span>
                <span className="text-xs text-subtle">Common App activities or a resume, up to 5 MB</span>
                <input
                  id={ids.file}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  aria-describedby={ids.status}
                />
              </label>
              {file ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-raised px-3 py-2 shadow-raise">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-fg">
                    <IconPage className="shrink-0 text-subtle" />
                    <span className="truncate">{file.name}</span>
                    <span className="tabular shrink-0 text-xs text-subtle">{sizeLabel(file.size)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => pickFile(null)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-subtle hover:bg-hover hover:text-fg"
                    aria-label={`Remove ${file.name}`}
                  >
                    <IconX size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {error ? (
            <p className="rounded-md bg-bad-wash px-3 py-2 text-sm text-bad" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={read} disabled={busy}>
              {busy ? <Spinner className="text-accent-fg" /> : null}
              {busy ? "Reading…" : "Read activities"}
            </Button>
            <p id={ids.status} className="text-xs text-subtle" aria-live="polite">
              {busy ? (mode === "upload" ? "Reading the PDF and finding your activities." : "Finding your activities.") : "Nothing is saved until you save your profile."}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div aria-live="polite">
            <p className="text-sm text-fg">
              {result.activities.length === 0
                ? "No activities were found."
                : `Found ${result.activities.length === 1 ? "1 activity" : `${result.activities.length} activities`}${result.format ? ` in ${FORMAT_LABEL[result.format] ?? "your text"}` : ""}.`}
            </p>
            {result.engine === "llm" ? <p className="mt-0.5 text-xs text-subtle">Read with Claude, then checked word for word against your text.</p> : null}
          </div>

          {result.warnings.length > 0 ? (
            <ul className="space-y-1 text-xs text-muted">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          {result.activities.length > 0 ? (
            <fieldset>
              <legend className="sr-only">Activities to add</legend>
              <ul className="divide-y divide-line overflow-hidden rounded-lg bg-raised shadow-raise">
                {result.activities.map((a) => {
                  const subtitle = [a.role, a.organization && a.organization !== a.title ? a.organization : ""].filter(Boolean).join(", ");
                  const meta = [a.category, a.grades ? `Grades ${a.grades}` : "", a.hoursPerWeek != null ? `${a.hoursPerWeek} hr/wk` : "", a.weeksPerYear != null ? `${a.weeksPerYear} wk/yr` : ""].filter(Boolean);
                  return (
                    <li key={a.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-hover has-[:focus-visible]:bg-hover">
                        <input
                          type="checkbox"
                          checked={selected.has(a.id)}
                          onChange={() => toggle(a.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-fg">{a.title}</span>
                          {subtitle ? <span className="block text-sm text-muted">{subtitle}</span> : null}
                          {meta.length ? (
                            <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-subtle">
                              {meta.map((m, i) => (
                                <span key={`${i}-${m}`} className="tabular">
                                  {m}
                                </span>
                              ))}
                            </span>
                          ) : null}
                          {a.description ? <span className="mt-1 line-clamp-2 block text-sm text-muted">{a.description}</span> : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {result.activities.length > 0 ? (
              <>
                <Button variant="primary" onClick={() => apply("merge")} disabled={count === 0}>
                  {existingCount > 0 ? `Add ${count} to the list` : `Add ${count === 1 ? "1 activity" : `${count} activities`}`}
                </Button>
                {existingCount > 0 ? (
                  <Button variant="secondary" onClick={() => setConfirmReplace(true)} disabled={count === 0}>
                    Replace the list
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button variant="ghost" onClick={resetResult}>
              {result.activities.length > 0 ? "Start over" : "Try again"}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmReplace}
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => apply("replace")}
        title="Replace the activities list?"
        description={`The ${existingCount === 1 ? "activity" : `${existingCount} activities`} on the list now will be replaced by the ${count === 1 ? "imported one" : `${count} imported`}. Nothing changes until you save, and Discard changes brings the old list back.`}
        confirmLabel="Replace the list"
      />
    </section>
  );
}
