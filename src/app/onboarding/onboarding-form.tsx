"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, Input, Select } from "@/components/ui/field";
import type { AccountRole } from "@/lib/types";
import { completeOnboardingAction, type OnboardingState } from "./actions";

const ROLE_OPTIONS: { value: AccountRole; label: string; description: string }[] = [
  { value: "student", label: "Student", description: "Research the schools on your own list." },
  { value: "parent", label: "Parent", description: "Help your child research the schools on their list." },
  { value: "counselor", label: "Counselor", description: "Manage research for several students." },
];

export function OnboardingForm({
  defaultRole,
  defaultName,
  years,
  defaultYear,
}: {
  defaultRole: AccountRole | null;
  defaultName: string;
  years: number[];
  defaultYear: number;
}) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboardingAction, { status: "idle" });
  const [role, setRole] = useState<AccountRole | null>(defaultRole);
  const [yourName, setYourName] = useState(defaultName);
  const [studentName, setStudentName] = useState("");
  const [year, setYear] = useState(String(defaultYear));
  const [highSchool, setHighSchool] = useState("");
  const errors = state.status === "error" ? state.errors : {};
  const own = role === "student";

  return (
    <form action={action} className="space-y-10" noValidate>
      <fieldset>
        <legend className="text-sm font-medium text-fg">Who is this account for?</legend>
        <div className="mt-3 overflow-hidden rounded-lg bg-raised shadow-raise" role="presentation">
          {ROLE_OPTIONS.map((opt, i) => (
            <label
              key={opt.value}
              className={cn(
                "relative flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-hover has-[:focus-visible]:bg-hover",
                i > 0 && "border-t border-line",
                role === opt.value && "bg-hover",
              )}
            >
              <input
                type="radio"
                name="role"
                value={opt.value}
                checked={role === opt.value}
                onChange={() => setRole(opt.value)}
                className="peer sr-only"
                aria-describedby={`role-${opt.value}-desc`}
              />
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full shadow-[0_0_0_1px_var(--line-strong)] transition-shadow peer-focus-visible:shadow-[0_0_0_2px_var(--focus)]",
                  role === opt.value && "shadow-[0_0_0_1px_var(--accent-line)]",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full bg-accent transition-opacity", role === opt.value ? "opacity-100" : "opacity-0")} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{opt.label}</span>
                <span id={`role-${opt.value}-desc`} className="block text-sm text-muted">
                  {opt.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        {errors.role ? (
          <p className="mt-2 text-xs text-bad" role="alert">
            {errors.role}
          </p>
        ) : null}
      </fieldset>

      {role ? (
        <div className="animate-enter space-y-8">
          <fieldset className="space-y-5">
            <legend className="mb-4 text-sm font-medium text-fg">{own ? "Your profile" : "About you"}</legend>
            <Field label={own ? "Your name" : "Your name"} htmlFor="yourName" error={errors.yourName}>
              <Input
                id="yourName"
                name="yourName"
                autoComplete="name"
                value={yourName}
                onChange={(e) => setYourName(e.target.value)}
                aria-invalid={Boolean(errors.yourName)}
                required
                maxLength={100}
              />
            </Field>
          </fieldset>

          <fieldset className="space-y-5">
            {!own ? <legend className="mb-4 text-sm font-medium text-fg">First student</legend> : null}
            {!own ? (
              <Field label="Student's name" htmlFor="studentName" error={errors.studentName}>
                <Input
                  id="studentName"
                  name="studentName"
                  autoComplete="off"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  aria-invalid={Boolean(errors.studentName)}
                  required
                  maxLength={100}
                />
              </Field>
            ) : null}
            <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
              <Field label="Graduation year" htmlFor="graduationYear" error={errors.graduationYear}>
                <Select
                  id="graduationYear"
                  name="graduationYear"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  aria-invalid={Boolean(errors.graduationYear)}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="High school" htmlFor="highSchool" hint="Optional" error={errors.highSchool}>
                <Input
                  id="highSchool"
                  name="highSchool"
                  autoComplete="off"
                  value={highSchool}
                  onChange={(e) => setHighSchool(e.target.value)}
                  aria-invalid={Boolean(errors.highSchool)}
                  maxLength={160}
                />
              </Field>
            </div>
          </fieldset>

          {state.status === "error" && state.message ? (
            <p className="rounded-md bg-bad-wash px-3 py-2 text-sm text-bad" role="alert">
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-subtle sm:max-w-xs">
              {own ? "Next: your activities, intended majors, and interests." : "Next: add more students or build this student's profile."}
            </p>
            <Button type="submit" variant="primary" size="lg" disabled={pending}>
              {pending ? (own ? "Creating profile…" : "Adding student…") : own ? "Create profile" : "Add student"}
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
