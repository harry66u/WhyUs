"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, Input, Textarea } from "@/components/ui/field";
import { IconChevronDown, IconPlus, IconTrash } from "@/components/ui/icons";
import { themeLabel } from "@/lib/matching/themes";
import { activityThemes } from "@/lib/profile/activities";
import { COMMON_APP_ACTIVITY_TYPES, COMMON_APP_LIMITS } from "@/lib/profile/common-app";
import type { FieldErrors } from "@/lib/profile/validate";
import { blankActivity, type EditableActivity } from "./editable";

const EASE = [0.22, 1, 0.36, 1] as const;

function Themes({ activity }: { activity: EditableActivity }) {
  const keys = activityThemes(activity);
  if (keys.length === 0) {
    return <p className="text-xs text-subtle">No themes detected yet. Name the topic, the tools, or who it served.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-xs text-subtle">Matching reads</span>
      <ul className="contents">
        {keys.map((k) => (
          <li key={k}>
            <Badge tone="neutral">{themeLabel(k)}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meta({ a }: { a: EditableActivity }) {
  const parts: string[] = [];
  if (a.category) parts.push(a.category);
  if (a.grades) parts.push(/^\d|^post/i.test(a.grades) ? `Grades ${a.grades}` : a.grades);
  if (a.hoursPerWeek) parts.push(`${a.hoursPerWeek} hr/wk`);
  if (a.weeksPerYear) parts.push(`${a.weeksPerYear} wk/yr`);
  if (parts.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-subtle">
      {parts.map((p, i) => (
        <span key={`${i}-${p}`} className="tabular">
          {p}
        </span>
      ))}
    </p>
  );
}

export function ActivitiesEditor({
  activities,
  onChange,
  errors,
  forceOpen,
}: {
  activities: EditableActivity[];
  onChange: (next: EditableActivity[]) => void;
  /** Errors keyed by activity id, then field. */
  errors: Record<string, FieldErrors>;
  /** Ids to open (for example, rows with errors after a save). */
  forceOpen: string[];
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ activity: EditableActivity; index: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const reduceMotion = useReducedMotion();
  const listId = useId();
  const typesId = useId();

  const isOpen = (id: string) => open.has(id) || forceOpen.includes(id) || Boolean(errors[id]);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const update = (id: string, patch: Partial<EditableActivity>) => onChange(activities.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= activities.length) return;
    const next = [...activities];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    onChange(next);
    setAnnouncement(`${item.title || "Activity"} moved to position ${to + 1} of ${next.length}.`);
  };

  const remove = (index: number) => {
    const item = activities[index];
    onChange(activities.filter((_, i) => i !== index));
    setRemoved({ activity: item, index });
    setAnnouncement(`Removed ${item.title || "activity"}.`);
  };

  const undo = () => {
    if (!removed) return;
    const next = [...activities];
    next.splice(Math.min(removed.index, next.length), 0, removed.activity);
    onChange(next);
    setAnnouncement(`Restored ${removed.activity.title || "activity"}.`);
    setRemoved(null);
  };

  const add = () => {
    const a = blankActivity();
    onChange([...activities, a]);
    setOpen((prev) => new Set(prev).add(a.id));
    setJustAdded(a.id);
    setRemoved(null);
  };

  return (
    <div>
      <datalist id={typesId}>
        {COMMON_APP_ACTIVITY_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {removed ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-sunken px-3 py-2 text-sm text-muted shadow-[0_0_0_1px_var(--line)]">
          <span className="min-w-0 truncate">Removed {removed.activity.title || "an activity"}.</span>
          <Button size="sm" variant="ghost" onClick={undo}>
            Undo
          </Button>
        </div>
      ) : null}

      {activities.length > 0 ? (
        <ol id={listId} className="divide-y divide-line rounded-lg bg-raised shadow-raise" aria-label="Activities, in the order they appear on the application">
          <AnimatePresence initial={false}>
            {activities.map((a, i) => {
              const expanded = isOpen(a.id);
              const rowErrors = errors[a.id] ?? {};
              const fid = (f: string) => `${a.id}-${f}`;
              const descLen = a.description.length;
              const subtitle = [a.role, a.organization && a.organization !== a.title ? a.organization : ""].filter(Boolean).join(", ");
              return (
                <motion.li
                  key={a.id}
                  layout={reduceMotion ? false : "position"}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.14 } }}
                  transition={{ duration: 0.22, ease: EASE, layout: { duration: 0.2, ease: EASE } }}
                  className="px-4 py-4 sm:px-5"
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    <span className="tabular mt-0.5 w-5 shrink-0 text-right text-xs text-subtle" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-medium text-fg">{a.title || <span className="text-subtle">Untitled activity</span>}</h3>
                          {subtitle ? <p className="truncate text-sm text-muted">{subtitle}</p> : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button size="sm" variant="ghost" onClick={() => toggle(a.id)} aria-expanded={expanded} aria-controls={expanded ? fid("fields") : undefined}>
                            {expanded ? "Done" : "Edit"}
                          </Button>
                          <button
                            type="button"
                            onClick={() => move(i, -1)}
                            disabled={i === 0}
                            className="grid h-8 w-8 place-items-center rounded-md text-subtle transition-colors hover:bg-hover hover:text-fg disabled:opacity-30"
                            aria-label={`Move ${a.title || "activity"} up`}
                          >
                            <IconChevronDown className="rotate-180" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(i, 1)}
                            disabled={i === activities.length - 1}
                            className="grid h-8 w-8 place-items-center rounded-md text-subtle transition-colors hover:bg-hover hover:text-fg disabled:opacity-30"
                            aria-label={`Move ${a.title || "activity"} down`}
                          >
                            <IconChevronDown />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(i)}
                            className="grid h-8 w-8 place-items-center rounded-md text-subtle transition-colors hover:bg-hover hover:text-fg"
                            aria-label={`Remove ${a.title || "activity"}`}
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </div>

                      {!expanded ? (
                        <div className="mt-2 space-y-2">
                          <Meta a={a} />
                          {a.description ? <p className="line-clamp-2 max-w-[75ch] text-sm text-muted">{a.description}</p> : null}
                          <Themes activity={a} />
                        </div>
                      ) : (
                        <div id={fid("fields")} className="mt-4 grid gap-5 sm:grid-cols-2">
                          <Field label="Title" htmlFor={fid("title")} error={rowErrors.title} className="sm:col-span-2">
                            <Input
                              id={fid("title")}
                              value={a.title}
                              onChange={(e) => update(a.id, { title: e.target.value })}
                              aria-invalid={Boolean(rowErrors.title)}
                              autoFocus={justAdded === a.id}
                              maxLength={160}
                              placeholder="Creek water-quality sensor network"
                            />
                          </Field>
                          <Field
                            label="Position or role"
                            htmlFor={fid("role")}
                            error={rowErrors.role}
                            hint={a.role.length > COMMON_APP_LIMITS.position ? `${a.role.length} characters; the Common App allows ${COMMON_APP_LIMITS.position}.` : "Founder, captain, member, intern."}
                          >
                            <Input id={fid("role")} value={a.role} onChange={(e) => update(a.id, { role: e.target.value })} maxLength={120} aria-invalid={Boolean(rowErrors.role)} />
                          </Field>
                          <Field
                            label="Organization"
                            htmlFor={fid("organization")}
                            error={rowErrors.organization}
                            hint={a.organization.length > COMMON_APP_LIMITS.organization ? `${a.organization.length} characters; the Common App allows ${COMMON_APP_LIMITS.organization}.` : undefined}
                          >
                            <Input
                              id={fid("organization")}
                              value={a.organization}
                              onChange={(e) => update(a.id, { organization: e.target.value })}
                              maxLength={160}
                              aria-invalid={Boolean(rowErrors.organization)}
                            />
                          </Field>
                          <Field label="Activity type" htmlFor={fid("category")} error={rowErrors.category} hint="A Common App type, or your own." className="sm:col-span-2 sm:max-w-sm">
                            <Input
                              id={fid("category")}
                              list={typesId}
                              value={a.category}
                              onChange={(e) => update(a.id, { category: e.target.value })}
                              maxLength={60}
                              aria-invalid={Boolean(rowErrors.category)}
                            />
                          </Field>
                          <div className="space-y-1.5 sm:col-span-2">
                            <div className="flex items-baseline justify-between gap-3">
                              <label htmlFor={fid("description")} className="text-sm font-medium text-fg">
                                Description
                              </label>
                              <span
                                className={cn("tabular text-xs", descLen > COMMON_APP_LIMITS.description ? "text-bad" : "text-subtle")}
                                aria-hidden="true"
                              >
                                {descLen}/{COMMON_APP_LIMITS.description}
                              </span>
                            </div>
                            <Textarea
                              id={fid("description")}
                              value={a.description}
                              onChange={(e) => update(a.id, { description: e.target.value })}
                              rows={3}
                              maxLength={1500}
                              aria-invalid={Boolean(rowErrors.description)}
                              aria-describedby={fid("description-hint")}
                            />
                            <p id={fid("description-hint")} className={cn("text-xs", rowErrors.description ? "text-bad" : "text-subtle")} role={rowErrors.description ? "alert" : undefined}>
                              {rowErrors.description ??
                                (descLen > COMMON_APP_LIMITS.description
                                  ? `${descLen} characters. The Common App allows ${COMMON_APP_LIMITS.description}; trim it there. The full text still helps matching here.`
                                  : `The Common App allows ${COMMON_APP_LIMITS.description} characters. Specifics help matching: what you built or did, the tools, the numbers, who it served.`)}
                            </p>
                          </div>
                          <Field label="Grade levels" htmlFor={fid("grades")} error={rowErrors.grades} hint="For example 10, 11, 12">
                            <Input id={fid("grades")} value={a.grades} onChange={(e) => update(a.id, { grades: e.target.value })} maxLength={60} aria-invalid={Boolean(rowErrors.grades)} />
                          </Field>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Hours per week" htmlFor={fid("hours")} error={rowErrors.hoursPerWeek}>
                              <Input
                                id={fid("hours")}
                                inputMode="decimal"
                                value={a.hoursPerWeek}
                                onChange={(e) => update(a.id, { hoursPerWeek: e.target.value })}
                                aria-invalid={Boolean(rowErrors.hoursPerWeek)}
                                className="tabular"
                              />
                            </Field>
                            <Field label="Weeks per year" htmlFor={fid("weeks")} error={rowErrors.weeksPerYear}>
                              <Input
                                id={fid("weeks")}
                                inputMode="numeric"
                                value={a.weeksPerYear}
                                onChange={(e) => update(a.id, { weeksPerYear: e.target.value })}
                                aria-invalid={Boolean(rowErrors.weeksPerYear)}
                                className="tabular"
                              />
                            </Field>
                          </div>
                          <div className="border-t border-line pt-4 sm:col-span-2">
                            <Themes activity={a} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button onClick={add} variant="secondary">
          <IconPlus />
          Add activity
        </Button>
        {activities.length > COMMON_APP_LIMITS.activities ? (
          <p className="text-xs text-subtle">
            {activities.length} activities. The Common App lists {COMMON_APP_LIMITS.activities}; matching uses them all.
          </p>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
