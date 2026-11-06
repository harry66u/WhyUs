/**
 * Wording of every draft-check note. One plain sentence each. Notes describe
 * what was found; none of them proposes replacement wording.
 */
import type { GenericFlag } from "./generic";
import type { ClicheCategory } from "./lexicon";

export const UNVERIFIED_MESSAGE = "Could not confirm this on an official page. Check the name and spelling.";

export const NEVER_REWRITES = "WhyUs points out problems. It never rewrites your essay.";

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function joinNames(names: string[]): string {
  const xs = [...new Set(names.filter(Boolean))];
  if (xs.length <= 1) return xs[0] ?? "";
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
}

export function wordCountMessage(count: number, limit: number): string {
  return `This draft has ${plural(count, "word")}, ${count - limit} over the ${limit}-word limit.`;
}

export function verifiedMessage(school: string, match: { title?: string | null; via: "name" | "quote" | "page" }): string {
  if (match.via === "name" && match.title) return `Matches “${match.title}” on an official ${school} page.`;
  if (match.via === "quote" && match.title) return `Appears on the official ${school} page for “${match.title}”.`;
  return `Appears on an official ${school} page.`;
}

export function wrongSchoolMessage(
  ref:
    | { kind: "school" | "nickname"; schools: string[] }
    | { kind: "unit"; schools: string[]; unitName?: string }
    | { kind: "city"; schools: string[]; city: string }
    | { kind: "fact"; schools: string[]; title: string },
): string {
  const who = joinNames(ref.schools);
  const another = ref.schools.length > 1 ? "other schools on your list" : "another school on your list";
  switch (ref.kind) {
    case "school":
    case "nickname":
      return `Names ${who}, ${another}.`;
    case "unit":
      return ref.unitName ? `${ref.unitName} is part of ${who}, ${another}.` : `Names part of ${who}, ${another}.`;
    case "city":
      return `${ref.city} is home to ${who}, ${another}.`;
    case "fact":
      return `Matches “${ref.title}” at ${who}, ${another}.`;
  }
}

export function swapMessage(schools: string[]): string {
  if (schools.length === 1) return `Swap test: ${schools[0]} has an equivalent, so this sentence could also go in your ${schools[0]} essay.`;
  return `Swap test: ${joinNames(schools)} have equivalents, so this sentence could also go in those essays.`;
}

function phraseMessage(phrase: string, category: ClicheCategory): string {
  const p = `“${phrase}”`;
  switch (category) {
    case "prestige":
      return `${p} praises reputation, which every school on your list could claim.`;
    case "praise":
      return `${p} is a description admissions readers see in many essays.`;
    case "fit":
      return `${p} asserts fit without naming what fits.`;
    case "opener":
      return `${p} is an opening many essays share.`;
    case "impact":
      return `${p} is a stock phrase that does not say what you would actually do.`;
    case "lesson":
      return `${p} is a stock way to state a lesson.`;
    default:
      return `${p} is a stock phrase that appears in many essays.`;
  }
}

export function genericMessage(flag: GenericFlag, school: string): string {
  if (flag.reason === "cliche") {
    const phrases = flag.phrases.slice(0, 3);
    if (phrases.length === 1) return phraseMessage(phrases[0].text, phrases[0].category);
    return `${joinNames(phrases.map((p) => `“${p.text}”`))} are phrases admissions readers see in many essays.`;
  }
  if (flag.reason === "praise") return `Praises ${school} without naming anything only ${school} has.`;
  if (flag.aboutSchool) return `Nothing here is specific to ${school}; any school on your list could say the same.`;
  return `Nothing in this sentence is specific to ${school} or to your own experience.`;
}
