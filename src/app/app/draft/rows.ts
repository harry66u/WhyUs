/**
 * Rows for the draft-check school picker: one per school on the student's
 * list, schools whose research is ready first. Pure (the page loads the data).
 */
import type { ApplicationRow } from "@/lib/data/applications";
import { getSchool, getUnit } from "@/lib/schools/registry";
import type { ApplicationStatus, School } from "@/lib/types";

export interface DraftPickerRow {
  id: string;
  schoolName: string;
  unitName: string | null;
  promptTitle: string;
  wordLimit: number | null;
  status: ApplicationStatus;
  href: string;
}

const STATUS_ORDER: Record<ApplicationStatus, number> = { ready: 0, researching: 1, queued: 2, failed: 3 };

function excerpt(text: string, max = 90): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

export function draftPickerRows(apps: Pick<ApplicationRow, "id" | "schoolId" | "unitId" | "promptId" | "promptText" | "wordLimit" | "status">[], lookup: (id: string) => School | undefined = getSchool): DraftPickerRow[] {
  return apps
    .map((app, order) => ({ app, order, school: lookup(app.schoolId) }))
    .filter((x): x is typeof x & { school: School } => Boolean(x.school))
    .sort((a, b) => (STATUS_ORDER[a.app.status] ?? 9) - (STATUS_ORDER[b.app.status] ?? 9) || a.order - b.order)
    .map(({ app, school }) => {
      const unit = getUnit(school, app.unitId);
      const prompt = app.promptId ? school.prompts.find((p) => p.id === app.promptId) : undefined;
      return {
        id: app.id,
        schoolName: school.name,
        unitName: unit && unit.name !== school.name ? unit.name : null,
        promptTitle: prompt?.title ?? excerpt(app.promptText),
        wordLimit: app.wordLimit ?? null,
        status: app.status,
        href: `/app/draft/${encodeURIComponent(app.id)}`,
      };
    });
}

export function statusText(status: ApplicationStatus): string {
  switch (status) {
    case "ready":
      return "Research ready";
    case "researching":
      return "Researching";
    case "queued":
      return "Queued";
    case "failed":
      return "Research stopped";
  }
}
