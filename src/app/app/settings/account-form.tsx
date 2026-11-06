"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { type AccountNameState, saveAccountNameAction } from "./actions";

export function AccountNameForm({ initialName }: { initialName: string }) {
  const [state, action, pending] = useActionState<AccountNameState, FormData>(saveAccountNameAction, { status: "idle" });
  const [name, setName] = useState(initialName);
  const saved = state.status === "saved" ? state.name : initialName;
  const dirty = name.replace(/\s+/g, " ").trim() !== saved;

  return (
    <form action={action} className="max-w-md" noValidate>
      <Field
        label="Your name"
        htmlFor="account-name"
        error={state.status === "error" ? state.message : undefined}
        hint="Shown to you in WhyUs. Student profiles keep their own names."
      >
        <div className="flex gap-2">
          <Input
            id="account-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={100}
            aria-invalid={state.status === "error"}
          />
          <Button type="submit" variant="secondary" disabled={pending || !dirty} className="h-10 shrink-0">
            {pending ? "Saving…" : state.status === "saved" && !dirty ? "Saved" : "Save"}
          </Button>
        </div>
      </Field>
      <p className="sr-only" aria-live="polite">
        {state.status === "saved" && !dirty ? "Name saved." : ""}
      </p>
    </form>
  );
}
