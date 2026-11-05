/**
 * School registry: official domains, undergraduate units, supplemental prompts,
 * and seed URLs. Source of truth is /data/schools/<id>.json.
 */
import cornell from "@data/schools/cornell.json";
import dartmouth from "@data/schools/dartmouth.json";
import penn from "@data/schools/penn.json";
import tufts from "@data/schools/tufts.json";
import umich from "@data/schools/umich.json";
import type { School, SchoolUnit, SupplementalPrompt } from "@/lib/types";

const SCHOOLS: School[] = [dartmouth, penn, cornell, tufts, umich] as unknown as School[];
const BY_ID = new Map(SCHOOLS.map((s) => [s.id, s]));

export function listSchools(): School[] {
  return SCHOOLS;
}

export function getSchool(id: string): School | undefined {
  return BY_ID.get(id);
}

export function requireSchool(id: string): School {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Unknown school: ${id}`);
  return s;
}

export function getUnit(school: School, unitId: string | null | undefined): SchoolUnit | undefined {
  if (!unitId) return undefined;
  return school.units.find((u) => u.id === unitId);
}

/** True when `host` is one of the school's official domains (or a subdomain) or an official third-party host. */
export function hostIsOfficial(host: string, school: School): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (school.officialHosts.some((o) => o.toLowerCase().replace(/^www\./, "") === h)) return true;
  return school.officialDomains.some((d) => {
    const dom = d.toLowerCase();
    return h === dom || h.endsWith(`.${dom}`);
  });
}

export function isOfficialUrl(url: string | URL, school: School): boolean {
  try {
    const u = typeof url === "string" ? new URL(url) : url;
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return hostIsOfficial(u.host, school);
  } catch {
    return false;
  }
}

/** The school whose official domains include this URL, if any. */
export function schoolForUrl(url: string): School | undefined {
  return SCHOOLS.find((s) => isOfficialUrl(url, s));
}

/** Prompts that apply to an applicant to `unitId` (unit-specific first, then school-wide). */
export function promptsFor(school: School, unitId: string | null): SupplementalPrompt[] {
  const specific = school.prompts.filter((p) => unitId && p.unitIds.includes(unitId));
  const general = school.prompts.filter((p) => p.unitIds.length === 0);
  return [...specific, ...general];
}

/** Units named in free text (used to scope a pasted custom prompt). Longest names match first. */
export function findUnitsInText(school: School, text: string): SchoolUnit[] {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9&]+/g, " ")} `;
  const hits: SchoolUnit[] = [];
  for (const unit of school.units) {
    const names = [unit.name, unit.shortName ?? "", ...unit.aliases]
      .map((n) => n.toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim())
      .filter((n) => n.length >= 3)
      .sort((a, b) => b.length - a.length);
    if (names.some((n) => hay.includes(` ${n} `))) hits.push(unit);
  }
  return hits;
}
