"use client";

import { type FormEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { RelativeTime } from "@/components/app/relative-time";
import { TagInput } from "@/components/app/tag-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, Input, Select } from "@/components/ui/field";
import { themeLabel } from "@/lib/matching/themes";
import { activityThemes, mergeActivities } from "@/lib/profile/activities";
import { type FieldErrors, PROFILE_LIMITS } from "@/lib/profile/validate";
import type { Activity } from "@/lib/types";
import { saveProfileAction } from "./actions";
import { ActivitiesEditor } from "./activities-editor";
import { type EditorValues, newActivityId, snapshot, splitErrors, toEditable, valuesFromProfile } from "./editable";
import { ImportPanel } from "./import-panel";

function Section({ id, title, description, children }: { id: string; title: string; description: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-6 border-b border-line py-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
      <div>
        <h2 id={id} className="text-md font-medium text-fg">
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

type Status = { tone: "ok" | "bad" | "neutral"; text: string } | null;

export function ProfileEditor({
  studentId,
  isSelf,
  initial,
  years,
  savedAt,
  hasDossiers,
}: {
  studentId: string;
  isSelf: boolean;
  initial: EditorValues;
  years: number[];
  savedAt: string;
  hasDossiers: boolean;
}) {
  const [values, setValues] = useState<EditorValues>(initial);
  const [savedValues, setSavedValues] = useState<EditorValues>(initial);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [activityErrors, setActivityErrors] = useState<Record<string, FieldErrors>>({});
  const [status, setStatus] = useState<Status>(null);
  const [lastSaved, setLastSaved] = useState(savedAt);
  const [saving, startSave] = useTransition();
  const valuesRef = useRef(values);
  const ids = { basics: useId(), direction: useId(), activities: useId(), majorsHint: useId(), interestsHint: useId() };

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  const dirty = snapshot(values) !== snapshot(savedValues);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof EditorValues>(key: K, value: EditorValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (fieldErrors[key as string]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
    // A "Saved" note is stale once something changes; a save error stays until the next save.
    setStatus((s) => (s?.tone === "bad" ? s : null));
  };

  const save = () => {
    if (saving) return;
    const sent = values;
    const sentSnapshot = snapshot(sent);
    setStatus({ tone: "neutral", text: "Saving…" });
    startSave(async () => {
      const result = await saveProfileAction({
        studentId,
        name: sent.name,
        graduationYear: Number(sent.graduationYear),
        highSchool: sent.highSchool,
        location: sent.location,
        intendedMajors: sent.intendedMajors,
        interests: sent.interests,
        activities: sent.activities,
        ...(sent.activitiesSource !== undefined ? { activitiesSource: sent.activitiesSource } : {}),
      }).catch(() => null);
      if (!result) {
        setStatus({ tone: "bad", text: "The profile could not be saved. Check your connection and try again." });
        return;
      }
      if (!result.ok) {
        const { fields, byActivity } = splitErrors(result.errors, sent.activities);
        setFieldErrors(fields);
        setActivityErrors(byActivity);
        setStatus({ tone: "bad", text: result.message });
        return;
      }
      const next = valuesFromProfile(result.profile);
      setSavedValues(next);
      if (snapshot(valuesRef.current) === sentSnapshot) setValues(next);
      setFieldErrors({});
      setActivityErrors({});
      setLastSaved(result.savedAt);
      setStatus({
        tone: "ok",
        text: hasDossiers ? "Saved. Schools researched earlier keep their dossiers until you research them again." : "Saved.",
      });
    });
  };

  // Cmd/Ctrl+S saves.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save();
  };

  const applyImport = (imported: Activity[], how: "merge" | "replace", sourceText: string) => {
    const current: Activity[] = values.activities.map((a) => ({ id: a.id, title: a.title, organization: a.organization || undefined, description: a.description }));
    const { activities: mergedShape, added, skipped } = mergeActivities(current, imported, how, newActivityId);
    const byId = new Map(values.activities.map((a) => [a.id, a]));
    const importedById = new Map(imported.map((a) => [a.id, a]));
    const merged = mergedShape.map((a) => byId.get(a.id) ?? toEditable({ ...(importedById.get(a.id) ?? a), id: a.id }));
    setValues((v) => ({ ...v, activities: merged, activitiesSource: sourceText }));
    setActivityErrors({});
    const addedText = added === 1 ? "Added 1 activity" : `Added ${added} activities`;
    const skippedText = skipped > 0 ? ` (${skipped} already on the list)` : "";
    setStatus({ tone: "neutral", text: `${how === "replace" ? "Replaced the list. " : ""}${addedText}${skippedText}. Review them, then save.` });
  };

  const themeSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of values.activities) for (const k of activityThemes(a)) counts.set(k, (counts.get(k) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
  }, [values.activities]);

  const forceOpen = Object.keys(activityErrors);
  const whose = isSelf ? "your" : "this student's";

  return (
    <form onSubmit={onSubmit} noValidate className="pb-28">
      <Section id={ids.basics} title="Basics" description={`Used on ${whose} dossiers. Never shared unless you share a dossier link.`}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" htmlFor="profile-name" error={fieldErrors.name} className="sm:col-span-2 sm:max-w-md">
            <Input
              id="profile-name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              autoComplete={isSelf ? "name" : "off"}
              maxLength={PROFILE_LIMITS.name}
              aria-invalid={Boolean(fieldErrors.name)}
            />
          </Field>
          <Field label="Graduation year" htmlFor="profile-year" error={fieldErrors.graduationYear}>
            <Select
              id="profile-year"
              value={values.graduationYear}
              onChange={(e) => set("graduationYear", e.target.value)}
              aria-invalid={Boolean(fieldErrors.graduationYear)}
              className="max-w-[10rem]"
            >
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="High school" htmlFor="profile-school" hint="Optional" error={fieldErrors.highSchool}>
            <Input
              id="profile-school"
              value={values.highSchool}
              onChange={(e) => set("highSchool", e.target.value)}
              maxLength={PROFILE_LIMITS.highSchool}
              aria-invalid={Boolean(fieldErrors.highSchool)}
            />
          </Field>
          <Field
            label="Hometown"
            htmlFor="profile-location"
            hint="Optional. City and state; it helps connect place-based opportunities."
            error={fieldErrors.location}
            className="sm:col-span-2 sm:max-w-md"
          >
            <Input
              id="profile-location"
              value={values.location}
              onChange={(e) => set("location", e.target.value)}
              maxLength={PROFILE_LIMITS.location}
              aria-invalid={Boolean(fieldErrors.location)}
              placeholder="Lakeview, Ohio"
            />
          </Field>
        </div>
      </Section>

      <Section
        id={ids.direction}
        title="Direction"
        description="What you want to study and what you care about. Matching reads these alongside the activities."
      >
        <div className="space-y-6">
          <div className="space-y-1.5">
            <label htmlFor="profile-majors" className="block text-sm font-medium text-fg">
              Intended majors
            </label>
            <TagInput
              id="profile-majors"
              value={values.intendedMajors}
              onChange={(next) => set("intendedMajors", next)}
              maxTags={PROFILE_LIMITS.majors}
              maxLength={PROFILE_LIMITS.tag}
              placeholder="Environmental Engineering"
              describedBy={ids.majorsHint}
              invalid={Boolean(fieldErrors.intendedMajors)}
              itemLabel="major"
            />
            <p id={ids.majorsHint} className={cn("text-xs", fieldErrors.intendedMajors ? "text-bad" : "text-subtle")}>
              {fieldErrors.intendedMajors ?? `Up to ${PROFILE_LIMITS.majors}. Press Enter after each one.`}
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="profile-interests" className="block text-sm font-medium text-fg">
              Interests
            </label>
            <TagInput
              id="profile-interests"
              value={values.interests}
              onChange={(next) => set("interests", next)}
              maxTags={PROFILE_LIMITS.interests}
              maxLength={PROFILE_LIMITS.tag}
              placeholder="watershed science"
              describedBy={ids.interestsHint}
              invalid={Boolean(fieldErrors.interests)}
              itemLabel="interest"
            />
            <p id={ids.interestsHint} className={cn("text-xs", fieldErrors.interests ? "text-bad" : "text-subtle")}>
              {fieldErrors.interests ?? "Specific beats broad: “low-cost air sensors” finds more than “science”."}
            </p>
          </div>
        </div>
      </Section>

      <Section
        id={ids.activities}
        title="Activities"
        description="The core of matching. Each school's details are ranked by how directly they connect to what you have actually done."
      >
        <div className="space-y-6">
          <ImportPanel existingCount={values.activities.length} defaultOpen={values.activities.length === 0} onApply={applyImport} />

          {themeSummary.length > 0 ? (
            <div>
              <p className="text-xs text-subtle">Across these activities, matching reads</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {themeSummary.map(([key, n]) => (
                  <li key={key}>
                    <Badge tone="outline">
                      {themeLabel(key)}
                      {n > 1 ? <span className="tabular text-subtle">{n}</span> : null}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ActivitiesEditor
            activities={values.activities}
            onChange={(next) => set("activities", next)}
            errors={activityErrors}
            forceOpen={forceOpen}
          />
          {fieldErrors.activities ? (
            <p className="text-xs text-bad" role="alert">
              {fieldErrors.activities}
            </p>
          ) : null}
        </div>
      </Section>

      <div className="sticky bottom-4 z-20 mt-8">
        <div
          className={cn(
            "flex flex-col gap-3 rounded-lg px-4 py-3 transition-shadow duration-150 sm:flex-row sm:items-center sm:justify-between",
            dirty || status ? "bg-overlay shadow-pop" : "bg-raised shadow-raise",
          )}
        >
          <p
            role="status"
            className={cn("min-w-0 text-sm", status?.tone === "bad" ? "text-bad" : status?.tone === "ok" ? "text-fg" : "text-muted")}
          >
            {status ? (
              status.text
            ) : dirty ? (
              "Unsaved changes."
            ) : (
              <>
                Saved <RelativeTime iso={lastSaved} />.
              </>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {dirty ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setValues(savedValues);
                  setFieldErrors({});
                  setActivityErrors({});
                  setStatus(null);
                }}
                disabled={saving}
              >
                Discard changes
              </Button>
            ) : null}
            <Button type="submit" variant="primary" disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
