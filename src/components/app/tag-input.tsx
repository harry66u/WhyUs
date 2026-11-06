"use client";

import { type ClipboardEvent, type KeyboardEvent, useId, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { IconX } from "@/components/ui/icons";

/**
 * A list of short text entries (majors, interests). Enter or a comma adds the
 * typed entry; Backspace in an empty field removes the last one; pasting a
 * comma-separated list adds each item.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  maxTags,
  maxLength = 80,
  describedBy,
  invalid = false,
  itemLabel = "entry",
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxTags: number;
  maxLength?: number;
  describedBy?: string;
  invalid?: boolean;
  /** Used in announcements and button labels, e.g. "major". */
  itemLabel?: string;
}) {
  const [draft, setDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const full = value.length >= maxTags;

  const add = (raw: string[]) => {
    const next = [...value];
    const added: string[] = [];
    for (const item of raw) {
      const t = item.replace(/\s+/g, " ").trim().slice(0, maxLength);
      if (!t || next.length >= maxTags) continue;
      if (next.some((v) => v.toLowerCase() === t.toLowerCase())) continue;
      next.push(t);
      added.push(t);
    }
    if (added.length) {
      onChange(next);
      setAnnouncement(added.length === 1 ? `Added ${added[0]}.` : `Added ${added.length} ${itemLabel}s.`);
    }
  };

  const remove = (index: number) => {
    const removed = value[index];
    onChange(value.filter((_, i) => i !== index));
    setAnnouncement(`Removed ${removed}.`);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && !e.nativeEvent.isComposing) {
      if (draft.trim()) {
        e.preventDefault();
        add([draft]);
        setDraft("");
      } else if (e.key === ",") e.preventDefault();
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      e.preventDefault();
      remove(value.length - 1);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (/[,;\n]/.test(text)) {
      e.preventDefault();
      add(text.split(/[,;\n]+/));
    }
  };

  return (
    <div>
      <div
        className={cn(
          "flex min-h-10 flex-wrap items-center gap-1.5 rounded-md bg-sunken px-2 py-1.5 shadow-[0_0_0_1px_var(--line)] transition-shadow duration-150 focus-within:shadow-[0_0_0_1px_var(--accent-line),0_0_0_4px_var(--accent-wash)] hover:shadow-[0_0_0_1px_var(--line-strong)]",
          invalid && "shadow-[0_0_0_1px_var(--bad)]",
        )}
        onClick={(e) => {
          if (e.target === e.currentTarget) inputRef.current?.focus();
        }}
      >
        {value.length > 0 ? (
          <ul className="contents" aria-label={`${itemLabel[0].toUpperCase()}${itemLabel.slice(1)}s added`}>
            {value.map((tag, i) => (
              <li
                key={`${tag}-${i}`}
                className="inline-flex h-7 max-w-full items-center gap-1 rounded-sm bg-raised pr-1 pl-2.5 text-sm text-fg shadow-[0_0_0_1px_var(--line-strong)]"
              >
                <span className="truncate">{tag}</span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-xs text-subtle transition-colors hover:bg-hover hover:text-fg"
                  aria-label={`Remove ${tag}`}
                >
                  <IconX size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={inputRef}
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => {
            if (draft.trim()) {
              add([draft]);
              setDraft("");
            }
          }}
          maxLength={maxLength}
          disabled={full}
          placeholder={full ? `Up to ${maxTags}` : value.length === 0 ? placeholder : undefined}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="h-7 min-w-[9rem] flex-1 bg-transparent px-1 text-sm text-fg placeholder:text-subtle focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed"
        />
      </div>
      <p id={statusId} className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
