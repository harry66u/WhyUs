"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { signInAction, type SignInState } from "./actions";

export function LoginForm({ next, expired }: { next: string | null; expired: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div className="space-y-4" aria-live="polite">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">Check your email</h2>
        <p className="text-sm text-muted">
          We sent a sign-in link to <span className="text-fg">{state.email}</span>. It works once and expires in 20 minutes.
        </p>
        {state.devLink ? (
          <div className="rounded-md bg-sunken p-3 text-xs text-muted shadow-[0_0_0_1px_var(--line)]">
            <p className="mb-1.5 text-subtle">Development only: no email provider is configured.</p>
            <a href={state.devLink} className="break-all text-accent-text underline underline-offset-2">
              Open the sign-in link
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      {expired ? (
        <p className="rounded-md bg-bad-wash px-3 py-2 text-sm text-bad" role="alert">
          That sign-in link has expired or was already used. Request a new one.
        </p>
      ) : null}
      <Field label="Email" htmlFor="email" error={state.status === "error" ? state.message : undefined}>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" aria-invalid={state.status === "error"} />
      </Field>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? "Sending link…" : "Email me a sign-in link"}
      </Button>
      <p className="text-xs text-subtle">No password. We email you a one-time link. Your first school is free.</p>
    </form>
  );
}
