/**
 * Per-fact features used by ranking, the swap test, and explanations.
 *
 * Stored fact themes are a mix of research-agent tags and automatic detection
 * over the whole quote, so a theme mentioned once in passing looks the same as
 * the fact's actual subject. Features re-detect themes per field and weight
 * them: title > summary/hook > quote only. Tags that no field supports keep a
 * moderate weight (they were chosen deliberately by the researcher).
 */
import type { Fact, FactKind } from "@/lib/types";
import { THEMES, isThemeKey } from "./themes";
import { contentBigrams, contentStems, courseCodeOf, titleWithoutCode } from "./text";

export type KindFamily = "course" | "study" | "research" | "facility" | "group" | "program" | "tradition" | "place";

export const KIND_FAMILY: Record<FactKind, KindFamily> = {
  course: "course",
  major: "study",
  faculty: "research",
  lab: "research",
  center: "research",
  facility: "facility",
  organization: "group",
  program: "program",
  tradition: "tradition",
  location: "place",
};

export const ACADEMIC_KINDS: ReadonlySet<FactKind> = new Set<FactKind>(["course", "major", "faculty", "lab", "center"]);
export const NON_ACADEMIC_KINDS: ReadonlySet<FactKind> = new Set<FactKind>(["organization", "tradition", "location"]);

/** Theme strength by the field it was found in. */
export const FIELD_STRENGTH = { title: 1, lead: 0.78, stored: 0.5, quote: 0.4 } as const;

/**
 * Everyday things most campuses have. Two facts naming the same one are
 * equivalent for the swap test even when their wording differs.
 */
const EQUIVALENCE: [string, RegExp][] = [
  ["outing-club", /\b(?:outing club|outdoors? club|outdoor (?:program|education|adventures?|recreation|pursuits|leadership))\b/i],
  ["outdoor-orientation", /\b(?:pre-?orientation trips?|first-year trips?|outdoor orientation)\b/i],
  ["makerspace", /\b(?:maker ?spaces?|maker labs?|fab labs?|fabrication labs?|prototyping (?:labs?|studios?|shops?)|innovation (?:labs?|studios?))\b/i],
  ["machine-shop", /\b(?:machine shops?|student shops?|fabrication shops?|manufacturing (?:and learning )?studios?)\b/i],
  ["jazz-ensemble", /\b(?:jazz (?:ensembles?|bands?|combos?|orchestras?)|big bands?)\b/i],
  ["orchestra", /\b(?:symphony orchestras?|orchestras?)\b/i],
  ["choir", /\b(?:choirs?|chorus|glee club|chorale|a cappella)\b/i],
  ["marching-band", /\bmarching bands?\b/i],
  ["debate", /\b(?:debate (?:teams?|society|union|program|club)|speech and debate|forensics? (?:team|union|society)|parliamentary debate|policy debate)\b/i],
  ["model-un", /\b(?:model un|model united nations)\b/i],
  ["mock-trial", /\bmock trial\b/i],
  ["newspaper", /\b(?:student newspapers?|daily newspapers?|campus newspapers?|student-run newspapers?)\b/i],
  ["radio", /\b(?:student radio|radio stations?|college radio|campus radio)\b/i],
  ["entrepreneurship-center", /\b(?:entrepreneurship (?:centers?|centres?|hubs?|programs?|institutes?)|centers? for (?:entrepreneurship|innovation)|startup (?:accelerators?|incubators?)|venture (?:labs?|studios?)|incubators?)\b/i],
  ["community-engagement-center", /\b(?:centers? for (?:public service|civic engagement|community engagement|social impact|community partnerships?)|community engagement centers?|public service centers?|civic engagement centers?)\b/i],
  ["undergraduate-research-program", /\b(?:undergraduate research (?:programs?|opportunities|scholars|fellowships?|assistantships?)|(?:summer|mentored|first[- ]year|early) research (?:programs?|positions?|projects?|experiences?|scholars|fellowships?)|research (?:mentorships?|apprenticeships?)|research scholars programs?|first[- ]year research)\b/i],
  ["engineers-without-borders", /\bengineers without borders\b/i],
  ["shpe", /\bsociety of hispanic professional engineers\b/i],
  ["nsbe", /\bnational society of black engineers\b/i],
  ["swe", /\bsociety of women engineers\b/i],
  ["solar-car", /\bsolar (?:car|racing|vehicle)s?\b/i],
  ["concrete-canoe", /\bconcrete canoes?\b/i],
  ["formula-racing", /\bformula (?:sae|racing|student)\b/i],
  ["rocketry", /\brocketry\b/i],
  ["robotics-team", /\brobotics (?:teams?|clubs?)\b/i],
  ["bike-coop", /\b(?:bike|bicycle) (?:co-?ops?|cooperatives?|collectives?|kitchens?|shops?)\b/i],
  ["cycling-club", /\b(?:cycling (?:clubs?|teams?)|bike clubs?)\b/i],
  ["botanic-garden", /\b(?:botanic(?:al)? gardens?|arboretums?)\b/i],
  ["art-museum", /\b(?:art museums?|museums? of art)\b/i],
  ["observatory", /\bobservator(?:y|ies)\b/i],
  ["campus-farm", /\b(?:student farms?|campus farms?|organic farms?)\b/i],
  ["study-abroad", /\b(?:study abroad|semesters? abroad|foreign study programs?)\b/i],
  ["first-year-seminar", /\b(?:first[- ]year seminars?|freshman seminars?)\b/i],
  ["environmental-club", /\b(?:environmental (?:clubs?|action|coalitions?)|sustainability (?:clubs?|coalitions?)|eco-?reps?|climate action (?:groups?|clubs?))\b/i],
  ["hackathon", /\bhackathons?\b/i],
  ["writing-center", /\bwriting centers?\b/i],
  ["career-center", /\bcareer (?:centers?|services)\b/i],
];

export interface FactFeatures {
  /** theme key -> strength (0-1) */
  themes: Map<string, number>;
  /** content stem -> field weight (title 1, summary/hook 0.8, quote 0.5) */
  tokens: Map<string, number>;
  /** stems in the title (without the course code) */
  titleStems: Set<string>;
  bigrams: Set<string>;
  family: KindFamily;
  /** Course code, e.g. "ENGS 28" */
  code: string | null;
  /** Grammatical subject for fit sentences: a course code, a person's name, or "this lab". */
  subject: string;
  /** Short name for angles and questions: "ENGS 28", "the Albertson Lab", "Cornell Speech and Debate". */
  name: string;
  /** Longer name for angles when there is room: "ENGS 42 (Watershed Hydrology)". */
  longName: string;
  /** 0-1: course codes, named people, named labs and groups are specific. */
  specificity: number;
  /** Canonical keys of everyday campus things this fact names (outing club, makerspace, ...). */
  equivalence: Set<string>;
}

const cache = new WeakMap<Fact, { sig: string; features: FactFeatures }>();

function signature(f: Fact): string {
  return `${f.id}\u0000${f.kind}\u0000${f.title}\u0000${f.nameOnPage}\u0000${f.summary}\u0000${f.hook}\u0000${f.quote}\u0000${(f.themes ?? []).join(",")}\u0000${(f.people ?? []).join(",")}`;
}

export function factFeatures(fact: Fact): FactFeatures {
  const sig = signature(fact);
  const hit = cache.get(fact);
  if (hit && hit.sig === sig) return hit.features;
  const features = computeFeatures(fact);
  cache.set(fact, { sig, features });
  return features;
}

function computeFeatures(fact: Fact): FactFeatures {
  const title = fact.title ?? "";
  const titleText = `${title}\n${fact.nameOnPage ?? ""}`;
  const leadText = `${fact.summary ?? ""}\n${fact.hook ?? ""}`;
  const quoteText = fact.quote ?? "";

  const themes = new Map<string, number>();
  for (const th of THEMES) {
    let s = 0;
    if (th.pattern.test(titleText)) s = FIELD_STRENGTH.title;
    else if (th.pattern.test(leadText)) s = FIELD_STRENGTH.lead;
    else if (th.pattern.test(quoteText)) s = FIELD_STRENGTH.quote;
    if (s > 0) themes.set(th.key, s);
  }
  for (const k of fact.themes ?? []) {
    if (!isThemeKey(k)) continue;
    const cur = themes.get(k) ?? 0;
    // A researcher's tag confirms a theme found only in the quote.
    if (cur < FIELD_STRENGTH.stored) themes.set(k, FIELD_STRENGTH.stored);
  }

  const code = fact.kind === "course" ? courseCodeOf(title, fact.nameOnPage) : null;
  const plainTitle = code ? titleWithoutCode(title) : title;

  const tokens = new Map<string, number>();
  const add = (text: string, w: number) => {
    for (const s of contentStems(text)) if ((tokens.get(s) ?? 0) < w) tokens.set(s, w);
  };
  add(plainTitle, 1);
  add(`${fact.summary ?? ""} ${fact.hook ?? ""}`, 0.8);
  add(quoteText, 0.5);
  for (const p of fact.people ?? []) add(p, 0.8);

  const titleStems = new Set(contentStems(plainTitle));
  const bigrams = new Set([...contentBigrams(plainTitle), ...contentBigrams(fact.summary ?? ""), ...contentBigrams(fact.hook ?? ""), ...contentBigrams(quoteText)]);

  const equivalence = new Set<string>();
  const eqText = `${titleText}\n${leadText}`;
  for (const [key, re] of EQUIVALENCE) if (re.test(eqText)) equivalence.add(key);

  let specificity = 0;
  switch (fact.kind) {
    case "course":
      specificity = code ? 0.65 : 0.45;
      break;
    case "faculty":
      specificity = 0.75;
      break;
    case "major":
      specificity = 0.25;
      break;
    default:
      specificity = 0.45;
  }
  if ((fact.people ?? []).length > 0 && fact.kind !== "faculty") specificity += 0.25;
  if (/\b[A-Z][a-z]+(?:'s)?\s+(?:Lab|Laboratory|Group|Center|Centre|Institute|Collection|Studio|Garden|Gardens|Observatory)\b/.test(title)) specificity += 0.1;
  specificity = Math.min(1, specificity);

  const { subject, name, longName } = namesFor(fact, code, plainTitle);

  return {
    themes,
    tokens,
    titleStems,
    bigrams,
    family: KIND_FAMILY[fact.kind] ?? "program",
    code,
    subject,
    name,
    longName,
    specificity,
    equivalence,
  };
}

/* ------------------------------------------------------------------ */
/* Names                                                                */
/* ------------------------------------------------------------------ */

/** Head nouns that take "the" ("the Albertson Lab", "the Rising Researchers Program"). */
const THE_HEADS =
  /\b(?:lab|labs|laboratory|laboratories|center|centre|institute|program|programme|team|club|society|group|studio|shop|major|minor|concentration|track|initiative|project|collaborative|network|collection|collections|museum|garden|gardens|library|station|farm|forest|preserve|observatory|ensemble|orchestra|choir|band|council|association|union|fellowship|house|hall|space|makerspace|fund|series|workshop|office|department|experience|exchange|partnership|seminar|clinic|cooperative|co-op|chapter|lecture|festival|week|weekend|competition|challenge|trip|trips|expedition|reserve|park|arboretum|tank|flume|tunnel|facility|facilities|archive|archives|journal|magazine|review|newspaper|press|radio|theater|theatre|company|corps|crew|league|squad|bowl)$/i;

function startsWithProperArticle(title: string): boolean {
  return /^(?:the|a|an)\s/i.test(title);
}

export function withArticle(title: string): string {
  const t = title.trim();
  if (startsWithProperArticle(t)) return t.replace(/^the\s/i, "the ").replace(/^a\s/i, "a ").replace(/^an\s/i, "an ");
  // "Dartmouth as Living Lab", "Dartmouth's ...": a name, not a common noun phrase.
  if (/\bas\b/i.test(t) || /^[^\s]+['’]s\s/.test(t)) return t;
  if (/^(?:[^\s]+\s+){0,4}(?:society|department|center|centre|institute|office|school|college|museum|program|council|association|union|house|hall|journal|league|initiative|lab|laboratory) (?:for|of|on|in)\b/i.test(t)) return `the ${t}`;
  const head = t.replace(/\s*\([^)]*\)\s*$/, "").split(/\s+/).pop() ?? "";
  if (THE_HEADS.test(head)) return `the ${t}`;
  return t;
}

/** A noun for "this ___" that fits the fact ("this lab", "this course"). */
function kindNoun(fact: Fact): string {
  const t = fact.title.toLowerCase();
  const pick = (words: string[], fallback: string) => words.find((w) => new RegExp(`\\b${w}s?\\b`).test(t)) ?? fallback;
  switch (fact.kind) {
    case "course":
      return pick(["seminar", "studio", "practicum", "workshop"], "course");
    case "major":
      return pick(["minor", "concentration", "track", "certificate", "major"], "program");
    case "lab":
      return pick(["group", "lab"], "lab");
    case "center":
      return pick(["institute", "center"], "center");
    case "facility":
      return pick(["lab", "studio", "shop", "garden", "station", "collection", "observatory", "museum", "library"], "facility");
    case "organization":
      return pick(["team", "club", "ensemble", "society", "chapter", "orchestra", "choir", "band", "publication", "newspaper", "magazine", "council"], "group");
    case "program":
      return pick(["fellowship", "practicum", "internship", "residency", "exchange", "seminar", "initiative"], "program");
    case "tradition":
      return "tradition";
    case "location":
      return pick(["project", "partnership", "program", "preserve", "forest", "station", "trail"], "opportunity");
    case "faculty":
      return "professor";
    default:
      return "program";
  }
}

/** Neutral nouns for titles that name several things ("Campus bike repair stations and Penn Bike Map"). */
const GENERIC_NOUN: Record<FactKind, string> = {
  course: "course",
  major: "program",
  faculty: "professor",
  lab: "lab",
  center: "center",
  facility: "facility",
  organization: "group",
  program: "program",
  tradition: "tradition",
  location: "opportunity",
};

/** Plural head noun ("Social Impact Practicums") would clash with a singular hook verb. */
function hasPluralHead(title: string): boolean {
  const core = title
    .replace(/\s*\([^)]*\)\s*$/, "")
    .split(/\s+(?:at|of|in|for|with|on|from|and)\s+/i)[0]
    .trim();
  const head = core.split(/\s+/).pop() ?? "";
  if (!/^[A-Za-z]+s$/.test(head)) return false;
  if (/(?:ss|us|is|ics|ies)$/i.test(head) && !/ies$/i.test(head)) return false;
  return head.length > 3;
}

function namesFor(fact: Fact, code: string | null, plainTitle: string): { subject: string; name: string; longName: string } {
  const title = fact.title.trim();
  if (fact.kind === "course") {
    if (code) {
      const longName = plainTitle && plainTitle !== title && plainTitle.length <= 44 ? `${code} (${plainTitle})` : code;
      return { subject: code, name: code, longName };
    }
    return { subject: "this course", name: withArticle(title), longName: withArticle(title) };
  }
  if (fact.kind === "faculty") {
    const person = (fact.people ?? [])[0] ?? title;
    return { subject: person, name: person, longName: person };
  }
  const named = withArticle(title);
  const plural = hasPluralHead(title);
  const subject = !plural && title.length <= 44 ? named : `this ${plural ? GENERIC_NOUN[fact.kind] : kindNoun(fact)}`;
  return { subject, name: named, longName: named };
}
