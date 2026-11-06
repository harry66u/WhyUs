"use client";

import Link from "next/link";
import { useActionState, useDeferredValue, useId, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, Input, Textarea } from "@/components/ui/field";
import { IconSearch } from "@/components/ui/icons";
import { SourceLink } from "@/components/ui/misc";
import { addSchoolAction, type AddSchoolState } from "./actions";
import { CUSTOM_PROMPT, formatWordLimit, type SchoolOption, type TakenOption, type UnitOption } from "./options";

function defaultPrompt(unit: UnitOption | undefined): string {
  if (!unit) return "";
  if (unit.prompts.length === 0) return CUSTOM_PROMPT;
  return unit.prompts.length === 1 ? unit.prompts[0].id : "";
}

function onlyUnit(school: SchoolOption | undefined): UnitOption | undefined {
  return school && school.units.length === 1 ? school.units[0] : undefined;
}

const row =
  "relative flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-hover has-[:focus-visible]:bg-hover";

function RadioMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full shadow-[0_0_0_1px_var(--line-strong)] transition-shadow peer-focus-visible:shadow-[0_0_0_2px_var(--focus)]",
        checked && "shadow-[0_0_0_1px_var(--accent-line)]",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full bg-accent transition-opacity", checked ? "opacity-100" : "opacity-0")} />
    </span>
  );
}

export function AddSchoolForm({
  studentId,
  schools,
  taken,
  initialSchoolId,
  blockedReason,
}: {
  studentId: string;
  schools: SchoolOption[];
  taken: TakenOption[];
  initialSchoolId?: string;
  blockedReason?: string | null;
}) {
  const [state, action, pending] = useActionState<AddSchoolState, FormData>(addSchoolAction, { status: "idle" });
  const initialSchool = schools.find((s) => s.id === initialSchoolId);
  const [schoolId, setSchoolId] = useState(initialSchool?.id ?? "");
  const [unitId, setUnitId] = useState(onlyUnit(initialSchool)?.id ?? "");
  const [promptChoice, setPromptChoice] = useState(defaultPrompt(onlyUnit(initialSchool)));
  const [customPrompt, setCustomPrompt] = useState("");
  const [customWordLimit, setCustomWordLimit] = useState("");
  const [query, setQuery] = useState("");
  const [pickingSchool, setPickingSchool] = useState(!initialSchool);
  const deferredQuery = useDeferredValue(query);
  const ids = { search: useId(), list: useId(), count: useId(), units: useId(), prompts: useId(), hint: useId() };

  const school = schools.find((s) => s.id === schoolId);
  const unit = school?.units.find((u) => u.id === unitId);
  const errors = state.status === "error" ? state.errors : {};
  const blocked = state.status === "error" && state.blocked ? state.errors.form : blockedReason;

  const terms = deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = terms.length ? schools.filter((s) => terms.every((t) => s.searchText.includes(t))) : schools;

  const chooseSchool = (id: string) => {
    const next = schools.find((s) => s.id === id);
    setSchoolId(id);
    const single = onlyUnit(next);
    setUnitId(single?.id ?? "");
    setPromptChoice(defaultPrompt(single));
    setPickingSchool(false);
  };

  const chooseUnit = (id: string) => {
    setUnitId(id);
    setPromptChoice(defaultPrompt(school?.units.find((u) => u.id === id)));
  };

  const takenFor = (sid: string, uid: string | null) => taken.find((t) => t.schoolId === sid && (t.unitId ?? null) === uid);
  const unitTaken = school && unit ? takenFor(school.id, unit.id) : undefined;
  const ready = Boolean(school && (school.units.length === 0 || unit) && promptChoice && !unitTaken);

  return (
    <form action={action} className="space-y-10" noValidate>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="promptChoice" value={promptChoice} />

      {blocked ? (
        <div className="rounded-lg bg-raised px-5 py-4 shadow-raise" role="alert">
          <p className="text-sm font-medium text-fg">This account cannot add another school yet</p>
          <p className="mt-1 text-sm text-muted">{blocked}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href="/app/settings#plan" variant="secondary" size="sm">
              See plans
            </ButtonLink>
            <ButtonLink href="/pricing" variant="ghost" size="sm">
              Compare plans
            </ButtonLink>
          </div>
        </div>
      ) : null}

      {/* School */}
      <fieldset>
        <legend className="text-md font-medium text-fg">School</legend>
        {school && !pickingSchool ? (
          <div className="mt-3 flex items-center justify-between gap-4 rounded-lg bg-raised px-4 py-3.5 shadow-raise">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{school.name}</p>
              <p className="text-xs text-muted">
                {school.city}, {school.state}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setPickingSchool(true)} aria-controls={ids.list} aria-expanded={false}>
              Change
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            <div className="relative">
              <label htmlFor={ids.search} className="sr-only">
                Search schools
              </label>
              <IconSearch className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
              <Input
                id={ids.search}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, college, or city"
                className="pl-9"
                aria-controls={ids.list}
                aria-describedby={ids.count}
                autoComplete="off"
                autoFocus={!school}
              />
            </div>
            <p id={ids.count} className="sr-only" aria-live="polite">
              {filtered.length === 1 ? "1 school matches." : `${filtered.length} schools match.`}
            </p>
            <div id={ids.list} className="mt-3 overflow-hidden rounded-lg bg-raised shadow-raise">
              {filtered.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted">
                  No school matches “{deferredQuery.trim()}”. WhyUs lists schools whose official sources it can verify.
                </p>
              ) : (
                filtered.map((s, i) => (
                  <label key={s.id} className={cn(row, i > 0 && "border-t border-line", s.id === schoolId && "bg-hover")}>
                    <input
                      type="radio"
                      name="schoolPick"
                      value={s.id}
                      checked={s.id === schoolId}
                      onChange={() => chooseSchool(s.id)}
                      className="peer sr-only"
                    />
                    <RadioMark checked={s.id === schoolId} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <span className="truncate text-sm font-medium text-fg">{s.name}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {s.city}, {s.state}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
        {errors.schoolId ? (
          <p className="mt-2 text-xs text-bad" role="alert">
            {errors.schoolId}
          </p>
        ) : null}
      </fieldset>

      {/* Unit */}
      {school && school.units.length > 0 ? (
        <fieldset className="animate-enter" aria-describedby={ids.units}>
          <legend className="text-md font-medium text-fg">School or college</legend>
          <p id={ids.units} className="mt-1 text-sm text-muted">
            Research is scoped to the part of {school.shortName} you are applying to.
          </p>
          <div className="mt-3 overflow-hidden rounded-lg bg-raised shadow-raise">
            {school.units.map((u, i) => {
              const already = takenFor(school.id, u.id);
              return (
                <div key={u.id} className={cn(i > 0 && "border-t border-line")}>
                  <label className={cn(row, u.id === unitId && "bg-hover", already && "cursor-default")}>
                    <input
                      type="radio"
                      name="unitPick"
                      value={u.id}
                      checked={u.id === unitId}
                      onChange={() => chooseUnit(u.id)}
                      disabled={Boolean(already)}
                      className="peer sr-only"
                    />
                    <RadioMark checked={u.id === unitId} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <span className={cn("text-sm text-fg", already && "text-muted")}>{u.name}</span>
                      {already ? (
                        <span className="shrink-0 text-xs text-muted">Already on the list</span>
                      ) : u.shortName && u.shortName !== u.name ? (
                        <span className="shrink-0 text-xs text-subtle">{u.shortName}</span>
                      ) : null}
                    </span>
                  </label>
                  {already ? (
                    <p className="-mt-2 pb-3 pl-11 text-xs">
                      <Link
                        href={`/app/schools/${already.applicationId}`}
                        className="text-muted underline decoration-line-strong underline-offset-[3px] hover:text-fg"
                      >
                        Open {u.shortName ?? u.name}
                      </Link>
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          {errors.unitId ? (
            <p className="mt-2 text-xs text-bad" role="alert">
              {errors.unitId}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {/* Prompt */}
      {school && unit && !unitTaken ? (
        <fieldset className="animate-enter" aria-describedby={ids.prompts}>
          <legend className="text-md font-medium text-fg">Prompt</legend>
          <p id={ids.prompts} className="mt-1 text-sm text-muted">
            {unit.prompts.length > 0
              ? "Pick the prompt you are answering, or paste it exactly as the application shows it."
              : "No prompts for this school or college are in the library yet. Paste the prompt exactly as the application shows it."}
          </p>
          <div className="mt-3 overflow-hidden rounded-lg bg-raised shadow-raise">
            {unit.prompts.map((p, i) => (
              <label key={p.id} className={cn(row, i > 0 && "border-t border-line", promptChoice === p.id && "bg-hover")}>
                <input
                  type="radio"
                  name="promptPick"
                  value={p.id}
                  checked={promptChoice === p.id}
                  onChange={() => setPromptChoice(p.id)}
                  className="peer sr-only"
                />
                <RadioMark checked={promptChoice === p.id} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <span className="text-sm font-medium text-fg">{p.title}</span>
                    <span className="tabular shrink-0 text-xs text-muted">{formatWordLimit(p.wordLimit)}</span>
                  </span>
                  <span className="mt-2 block max-w-[68ch] font-serif text-[0.975rem] leading-relaxed text-fg">{p.text}</span>
                  {p.note ? <span className="mt-1.5 block text-xs text-subtle">{p.note}</span> : null}
                  {p.sourceUrl ? <SourceLink url={p.sourceUrl} verifiedAt={p.verifiedAt} className="mt-2" /> : null}
                </span>
              </label>
            ))}
            <div className={cn(unit.prompts.length > 0 && "border-t border-line")}>
              <label className={cn(row, promptChoice === CUSTOM_PROMPT && "bg-hover")}>
                <input
                  type="radio"
                  name="promptPick"
                  value={CUSTOM_PROMPT}
                  checked={promptChoice === CUSTOM_PROMPT}
                  onChange={() => setPromptChoice(CUSTOM_PROMPT)}
                  className="peer sr-only"
                />
                <RadioMark checked={promptChoice === CUSTOM_PROMPT} />
                <span className="text-sm font-medium text-fg">{unit.prompts.length > 0 ? "Paste a different prompt" : "Paste the prompt"}</span>
              </label>
              {promptChoice === CUSTOM_PROMPT ? (
                <div className="grid gap-5 px-4 pt-1 pb-5 sm:pl-11">
                  <Field
                    label="Prompt text"
                    htmlFor="customPrompt"
                    hint="Copy it exactly, including any instructions about the school or college."
                    error={errors.customPrompt}
                  >
                    <Textarea
                      id="customPrompt"
                      name="customPrompt"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      rows={5}
                      maxLength={3000}
                      aria-invalid={Boolean(errors.customPrompt)}
                      className="font-serif text-[0.975rem]"
                    />
                  </Field>
                  <Field label="Word limit" htmlFor="customWordLimit" hint="Leave blank if the prompt has none." error={errors.customWordLimit}>
                    <Input
                      id="customWordLimit"
                      name="customWordLimit"
                      inputMode="numeric"
                      value={customWordLimit}
                      onChange={(e) => setCustomWordLimit(e.target.value)}
                      className="w-32"
                      aria-invalid={Boolean(errors.customWordLimit)}
                      placeholder="250"
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </div>
          {errors.promptChoice ? (
            <p className="mt-2 text-xs text-bad" role="alert">
              {errors.promptChoice}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {errors.form && !(state.status === "error" && state.blocked) ? (
        <div className="rounded-md bg-bad-wash px-3 py-2 text-sm text-bad" role="alert">
          {errors.form}
          {state.status === "error" && state.duplicateOf ? (
            <>
              {" "}
              <Link href={`/app/schools/${state.duplicateOf}`} className="underline underline-offset-[3px]">
                Open it
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p id={ids.hint} className="text-xs text-subtle">
          {ready ? "Research starts right away and takes about two minutes." : "Choose a school, the college within it, and a prompt."}
        </p>
        <Button type="submit" variant="primary" size="lg" disabled={!ready || pending} aria-describedby={ids.hint}>
          {pending ? "Adding school…" : "Add school"}
        </Button>
      </div>
    </form>
  );
}
