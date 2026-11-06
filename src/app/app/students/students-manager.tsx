"use client";

import { useActionState, useState, useTransition } from "react";
import { ConfirmDialog, Dialog } from "@/components/app/dialog";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { IconPlus } from "@/components/ui/icons";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { addStudentAction, deleteStudentAction, openStudentAction, type StudentFormState, updateStudentAction } from "./actions";

export interface StudentListRow {
  id: string;
  name: string;
  graduationYear: number;
  highSchool: string | null;
  location: string | null;
  schools: number;
  activities: number;
  active: boolean;
  isSelf: boolean;
}

function StudentForm({
  mode,
  student,
  years,
  defaultYear,
  onDone,
}: {
  mode: "add" | "edit";
  student?: StudentListRow;
  years: number[];
  defaultYear: number;
  onDone: (message: string) => void;
}) {
  const [state, action, pending] = useActionState<StudentFormState, FormData>(async (prev, formData) => {
    const result = await (mode === "add" ? addStudentAction(prev, formData) : updateStudentAction(prev, formData));
    if (result.status === "ok") onDone(result.message);
    return result;
  }, { status: "idle" });
  const [name, setName] = useState(student?.name ?? "");
  const [year, setYear] = useState(String(student?.graduationYear ?? defaultYear));
  const [highSchool, setHighSchool] = useState(student?.highSchool ?? "");
  const [location, setLocation] = useState(student?.location ?? "");
  const errors = state.status === "error" ? state.errors : {};
  const options = years.includes(Number(year)) ? years : [...years, Number(year)].sort((a, b) => a - b);

  if (state.status === "error" && state.blocked) {
    return (
      <div className="mt-5 space-y-4">
        <p className="rounded-md bg-sunken px-3 py-2 text-sm text-muted shadow-[0_0_0_1px_var(--line)]" role="alert">
          {state.message}
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/app/settings#plan" variant="secondary" size="sm">
            See plans
          </ButtonLink>
          <ButtonLink href="/app/settings" variant="ghost" size="sm">
            Billing settings
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="mt-5 space-y-5" noValidate>
      {student ? <input type="hidden" name="studentId" value={student.id} /> : null}
      <Field label="Student's name" htmlFor={`${mode}-name`} error={errors.name}>
        <Input
          id={`${mode}-name`}
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          maxLength={100}
          aria-invalid={Boolean(errors.name)}
          autoFocus
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-[9rem_1fr]">
        <Field label="Graduation year" htmlFor={`${mode}-year`} error={errors.graduationYear}>
          <Select id={`${mode}-year`} name="graduationYear" value={year} onChange={(e) => setYear(e.target.value)} aria-invalid={Boolean(errors.graduationYear)}>
            {options.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="High school" htmlFor={`${mode}-school`} hint="Optional" error={errors.highSchool}>
          <Input
            id={`${mode}-school`}
            name="highSchool"
            value={highSchool}
            onChange={(e) => setHighSchool(e.target.value)}
            maxLength={160}
            aria-invalid={Boolean(errors.highSchool)}
          />
        </Field>
      </div>
      <Field label="Hometown" htmlFor={`${mode}-location`} hint="Optional. City and state." error={errors.location}>
        <Input
          id={`${mode}-location`}
          name="location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={160}
          aria-invalid={Boolean(errors.location)}
        />
      </Field>
      {state.status === "error" && state.message ? (
        <p className="rounded-md bg-bad-wash px-3 py-2 text-sm text-bad" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? (mode === "add" ? "Adding…" : "Saving…") : mode === "add" ? "Add student" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function OpenButton({ studentId, next, children, primary = false }: { studentId: string; next: string; children: string; primary?: boolean }) {
  return (
    <form action={openStudentAction}>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="next" value={next} />
      <Button type="submit" size="sm" variant={primary ? "secondary" : "ghost"}>
        {children}
      </Button>
    </form>
  );
}

export function StudentsManager({
  rows,
  years,
  defaultYear,
  summary,
}: {
  rows: StudentListRow[];
  years: number[];
  defaultYear: number;
  summary: string;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StudentListRow | null>(null);
  const [deleting, setDeleting] = useState<StudentListRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [removing, startRemove] = useTransition();

  const confirmDelete = () => {
    const target = deleting;
    if (!target) return;
    setDeleteError(null);
    startRemove(async () => {
      const result = await deleteStudentAction(target.id);
      if (result.ok) {
        setDeleting(null);
        setMessage(result.message);
      } else setDeleteError(result.message);
    });
  };

  return (
    <div>
      <PageHeader
        title="Students"
        description={summary}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <IconPlus />
            Add student
          </Button>
        }
      />

      <p className="sr-only" aria-live="polite">
        {message}
      </p>
      {message ? (
        <p className="mt-6 text-sm text-muted" aria-hidden="true">
          {message}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="Add your first student"
          body="Each student gets their own profile, list of schools, and dossiers. Start with a name and class year."
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              <IconPlus />
              Add student
            </Button>
          }
        />
      ) : (
        <div className="mt-8">
          <div className="hidden gap-x-4 px-4 pb-2 text-2xs text-subtle lg:grid lg:grid-cols-[minmax(0,1.4fr)_6.5rem_minmax(0,1.2fr)_6rem_auto]" aria-hidden="true">
            <span>Student</span>
            <span>Class</span>
            <span>High school</span>
            <span>Schools</span>
            <span />
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-lg bg-raised shadow-raise">
            {rows.map((s) => (
              <li
                key={s.id}
                className="grid gap-x-4 gap-y-2 px-4 py-4 lg:grid-cols-[minmax(0,1.4fr)_6.5rem_minmax(0,1.2fr)_6rem_auto] lg:items-center lg:py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className="truncate font-medium text-fg">{s.name}</span>
                    {s.active ? <Badge tone="outline">Working on</Badge> : null}
                  </p>
                  <p className="text-xs text-subtle">
                    {s.activities === 0 ? "No activities yet" : s.activities === 1 ? "1 activity" : `${s.activities} activities`}
                    {s.location ? <span className="max-lg:hidden">, {s.location}</span> : null}
                  </p>
                </div>
                <p className="tabular text-sm text-muted">
                  <span className="lg:sr-only">Class of </span>
                  {s.graduationYear}
                </p>
                <p className="truncate text-sm text-muted">{s.highSchool ?? <span className="text-subtle">No high school listed</span>}</p>
                <p className="tabular text-sm text-muted">{s.schools === 1 ? "1 school" : `${s.schools} schools`}</p>
                <div className="flex flex-wrap items-center gap-1 lg:justify-end">
                  <OpenButton studentId={s.id} next="/app" primary>
                    Schools
                  </OpenButton>
                  <OpenButton studentId={s.id} next="/app/profile">
                    Profile
                  </OpenButton>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}>
                    Edit
                  </Button>
                  {!s.isSelf ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleting(s);
                      }}
                      aria-label={`Delete ${s.name}`}
                      className="hover:text-bad"
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add a student" description="Their profile, schools, and dossiers stay separate from your other students.">
        <StudentForm
          mode="add"
          years={years}
          defaultYear={defaultYear}
          onDone={(m) => {
            setAdding(false);
            setMessage(`${m} Open their profile to add activities.`);
          }}
        />
      </Dialog>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.name}` : "Edit student"}>
        {editing ? (
          <StudentForm
            key={editing.id}
            mode="edit"
            student={editing}
            years={years}
            defaultYear={defaultYear}
            onDone={(m) => {
              setEditing(null);
              setMessage(m);
            }}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onCancel={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
        onConfirm={confirmDelete}
        pending={removing}
        error={deleteError}
        title={deleting ? `Delete ${deleting.name}?` : "Delete student?"}
        description={
          deleting
            ? `This permanently deletes ${deleting.name}'s profile, ${deleting.schools === 1 ? "1 school" : `${deleting.schools} schools`}, every dossier, and any share links. It cannot be undone.`
            : ""
        }
        confirmLabel="Delete student"
        pendingLabel="Deleting…"
      />
    </div>
  );
}
