"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

/**
 * Modal dialog on the native <dialog> element: focus is trapped and Escape
 * closes it. Clicking the backdrop closes it too.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-lg bg-overlay p-0 text-fg shadow-pop open:animate-enter backdrop:bg-canvas/75 backdrop:backdrop-blur-[2px]",
        className,
      )}
    >
      {open ? (
        <div className="p-6">
          <h2 id={titleId} className="text-lg font-semibold tracking-[-0.02em] text-fg">
            {title}
          </h2>
          {description ? (
            <div id={descriptionId} className="mt-2 text-sm text-muted">
              {description}
            </div>
          ) : null}
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

/** A yes/no confirmation for destructive actions. Focus starts on Cancel. */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel,
  pendingLabel,
  pending = false,
  error,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  error?: string | null;
}) {
  return (
    <Dialog open={open} onClose={pending ? () => undefined : onCancel} title={title} description={description}>
      {error ? (
        <p className="mt-4 rounded-md bg-bad-wash px-3 py-2 text-sm text-bad" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={pending} autoFocus>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={pending}>
          {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
