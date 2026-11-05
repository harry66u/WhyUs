/** Display helpers shared by the UI, the PDF export, and emails. */

const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "2026-11-05" or an ISO timestamp -> "Nov 5, 2026" (UTC, stable across server and client). */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return DATE_FMT.format(d);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Host plus a shortened path, for citations: "engineering.dartmouth.edu/academics/courses/…" */
export function shortUrl(url: string, max = 64): string {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname).replace(/\/$/, "");
    const full = `${u.host.replace(/^www\./, "")}${path}`;
    return full.length > max ? `${full.slice(0, max - 1)}…` : full;
  } catch {
    return url;
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Elapsed mm:ss for the live research log. */
export function elapsed(fromIso: string, toIso: string): string {
  const ms = Math.max(0, Date.parse(toIso) - Date.parse(fromIso));
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export const KIND_LABELS: Record<string, string> = {
  course: "Course",
  major: "Major or program of study",
  faculty: "Faculty",
  lab: "Lab",
  center: "Center",
  facility: "Facility",
  organization: "Student organization",
  program: "Special program",
  tradition: "Tradition",
  location: "Place-based opportunity",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}
