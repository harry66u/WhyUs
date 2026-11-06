"use client";

import { type FormEvent, useId, useState } from "react";
import { Dialog } from "@/components/app/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { IconTrash } from "@/components/ui/icons";

export function DeleteAccount({ email, summary, initialError }: { email: string; summary: string; initialError?: string | null }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { input: useId(), hint: useId() };
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setTyped("");
    setError(null);
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!matches || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: typed }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirectTo?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Your account could not be deleted just now. Try again in a moment.");
        setPending(false);
        return;
      }
      // A full page load: nothing from the deleted account stays in memory.
      window.location.assign(data.redirectTo ?? "/?deleted=1");
    } catch {
      setError("WhyUs could not be reached. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <>
      {initialError ? (
        <p className="mb-4 rounded-md bg-bad-wash px-3 py-2 text-sm text-bad" role="alert">
          {initialError}
        </p>
      ) : null}
      <Button variant="danger" onClick={() => setOpen(true)}>
        <IconTrash />
        Delete account
      </Button>

      <Dialog
        open={open}
        onClose={close}
        title="Delete your account?"
        description={<p>{summary} This cannot be undone.</p>}
      >
        <form method="post" action="/api/account/delete" onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
          <div className="space-y-1.5">
            <label htmlFor={ids.input} className="block text-sm font-medium text-fg">
              Type <span className="font-semibold break-all">{email}</span> to confirm
            </label>
            <Input
              id={ids.input}
              name="confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby={ids.hint}
              aria-invalid={Boolean(error)}
            />
            <p id={ids.hint} className="text-xs text-subtle">
              Download your data first if you want a copy.
            </p>
          </div>
          {error ? (
            <p className="rounded-md bg-bad-wash px-3 py-2 text-sm text-bad" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close} disabled={pending} autoFocus>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={!matches || pending}>
              {pending ? "Deleting…" : "Delete account"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
