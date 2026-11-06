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
import { THEMES, isThemeKey, themeWeight } from "./themes";
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

/** Subjects that make policy work environmental policy. */
const ENVIRONMENT_POLICY_SUBJECTS = ["energy", "climate", "water", "environmental-engineering", "environmental-studies", "ecology", "sustainability"];

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
  /**
   * Themes the fact is about: named in its title, or among its strongest
   * summary/hook themes. A theme mentioned in passing ("tours to concerts by
   * bicycle") is not central and cannot carry a cited connection.
   */
  central: Set<string>;
  /**
   * 0-1 essay-worthiness: how well this detail can carry a "why this school"
   * argument. Courses, labs, faculty, majors, research programs and centers are
   * substantive; amenities (repair stations, maps, bike lanes, dining), generic
   * services, archival collections, recreation spots, and directory listings are weak.
   */
  substance: number;
  /**
   * Academic detail: courses, majors, faculty, labs, research centers, academic
   * and research programs, teaching labs, field and research opportunities.
   */
  academic: boolean;
  /** Everyday amenity, service, collection, or recreation spot (weak unless strongly matched). */
  amenity: boolean;
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
  // Policy work on an environmental subject is environmental policy ("energy systems
  // planning and climate mitigation at the line between engineering and public policy").
  const policy = Math.max(themes.get("public-policy") ?? 0, themes.get("law") ?? 0);
  const environment = Math.max(...ENVIRONMENT_POLICY_SUBJECTS.map((k) => themes.get(k) ?? 0));
  const derived = Math.min(policy, environment);
  if (derived >= FIELD_STRENGTH.lead && (themes.get("environmental-policy") ?? 0) < derived) themes.set("environmental-policy", derived);

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
  const essay = essayProfile(fact);

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
    central: centralThemes(themes),
    ...essay,
  };
}

/** Title-level themes, plus the strongest summary/hook themes (at most four by weighted strength). */
function centralThemes(themes: Map<string, number>): Set<string> {
  const out = new Set<string>();
  const lead = [...themes.entries()]
    .filter(([, v]) => v >= FIELD_STRENGTH.lead)
    .map(([k, v]) => [k, v * themeWeight(k)] as const)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [k] of lead) if ((themes.get(k) ?? 0) >= FIELD_STRENGTH.title) out.add(k);
  for (const [k] of lead.slice(0, 4)) out.add(k);
  if (out.size === 0) {
    // Nothing in the title, summary, or hook: the researcher's strongest tag stands in.
    const top = [...themes.entries()].sort((a, b) => b[1] * themeWeight(b[0]) - a[1] * themeWeight(a[0]) || a[0].localeCompare(b[0]))[0];
    if (top && top[1] >= FIELD_STRENGTH.stored) out.add(top[0]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Substance: is this something an essay can stand on?                  */
/* ------------------------------------------------------------------ */

const AMENITY_RE =
  /\b(?:repair stations?|bike (?:maps?|lanes?|lane network|parking|racks?|share)|bike-friendly|parking|dining|meal plans?|caf(?:e|é)s?|cafeterias?|shuttles?|bus (?:routes?|service)|gyms?|fitness cent(?:er|re)s?|recreation cent(?:er|re)s?|swimming pools?|lounges?|wi-?fi|lockers?|bookstores?|ski areas?|skiway)\b/i;
const COLLECTION_RE = /\b(?:sheet music|special collections?|rare books|manuscripts|(?:music|library|art|museum|archival) collections?|collection of|archives?|museums?)\b/i;
const SERVICE_RE =
  /\b(?:advis(?:es|ing|ors?)\b|career (?:services|cent(?:er|re)s?)|tutoring|help desk|consultations?|support network|holistic support|software such as|experts and services|reservable space|space students can reserve|helps students find|counseling services)\b/i;
const LISTING_RE = /\b(?:appears (?:in|on)|is listed (?:in|on)|listed in|lists the)\b/i;
const RECREATION_RE =
  /\b(?:recreation(?:al)?|trails?|kayak\w*|hiking|boating|swimming|fishing|skiing|camping|day trips|outdoor (?:trips|adventures?|expeditions?|recreation)|adventure (?:trips|programs?)|multi-day (?:outdoor )?expeditions?)\b/i;
const RESEARCH_RE =
  /\b(?:research\w*|laborator\w*|thesis|fellows(?:hips?)?|scholars|practicums?|capstone|field (?:stations?|research|programs?|courses?|traverse|data|measurements?|methods)|fieldwork|mentor scientists|faculty mentors?|investigat\w*|living lab\w*|test (?:sites?|beds?))\b/i;
const CURRICULUM_RE =
  /\b(?:courses?|coursework|curricul\w*|seminars?|colloquium|credit-bearing|credits?|degree|majors?|minors?|concentrations?|study abroad|foreign stud(?:y|ies)|stud(?:y|ies) programs?|study of|study (?:visits?|trips?|tours?)|immersion|instruction)\b/i;
const PROJECT_RE = /\b(?:designs?|builds?|develops?|prototyp\w*|engineering project|project team|hackathon|analy[sz]es?|analy[sz]e)\b/i;
const IDENTITY_RE = /\b(?:cultural|culture|identity|heritage|affinity|residential community|residence hall|living-learning|program house|first-generation)\b/i;
const VENTURE_ARTS_RE = /\b(?:entrepreneur\w*|startups?|business accelerator|arts initiative|access to the arts)\b/i;
const LAB_SPACE_RE = /\b(?:labs?|laborator\w*|studios?|instructional|flumes?|wave tanks?|imaging)\b/i;
const MAKER_RE = /\b(?:maker\w*|prototyp\w*|fabricat\w*|machine shop|3D print\w*|laser cut\w*|CNC|welding|woodworking)\b/i;

interface EssayProfile {
  substance: number;
  academic: boolean;
  amenity: boolean;
}

/**
 * Essay-worthiness by kind and content. Deterministic and conservative: kinds
 * set the baseline (courses, faculty, labs, majors highest; traditions lowest)
 * and the fact's own words move it (research, coursework, and project language
 * up; amenities, services, collections, recreation, and bare directory listings down).
 */
export function essayProfile(fact: Pick<Fact, "kind" | "title" | "summary" | "hook">): EssayProfile {
  const title = fact.title ?? "";
  const text = `${title}\n${fact.summary ?? ""}\n${fact.hook ?? ""}`;
  const research = RESEARCH_RE.test(text);
  const curriculum = CURRICULUM_RE.test(text);
  switch (fact.kind) {
    case "course":
    case "faculty":
      return { substance: 1, academic: true, amenity: false };
    case "lab":
      return { substance: LISTING_RE.test(text) ? 0.6 : 0.97, academic: true, amenity: false };
    case "major":
      return { substance: 0.92, academic: true, amenity: false };
    case "center":
      // Labs and centers are academic by default; identity, service, venture, and arts hubs are not.
      if (IDENTITY_RE.test(text) && !research) return { substance: 0.66, academic: false, amenity: false };
      if (SERVICE_RE.test(text)) return { substance: 0.55, academic: false, amenity: true };
      if (VENTURE_ARTS_RE.test(text) && !research) return { substance: 0.72, academic: false, amenity: false };
      if (research) return { substance: 0.9, academic: true, amenity: false };
      return { substance: /\binstitute\b/i.test(title) ? 0.85 : 0.78, academic: true, amenity: false };
    case "program":
      if (RECREATION_RE.test(text) && !research) return { substance: 0.5, academic: false, amenity: true };
      if (research) return { substance: 0.95, academic: true, amenity: false };
      if (IDENTITY_RE.test(text)) return { substance: 0.62, academic: false, amenity: false };
      if (curriculum) return { substance: 0.88, academic: true, amenity: false };
      return { substance: 0.72, academic: false, amenity: false };
    case "facility":
      if (AMENITY_RE.test(text)) return { substance: 0.42, academic: false, amenity: true };
      if (COLLECTION_RE.test(text)) return { substance: 0.5, academic: false, amenity: true };
      if (SERVICE_RE.test(text)) return { substance: 0.55, academic: false, amenity: true };
      if (LAB_SPACE_RE.test(title) || research || curriculum) {
        return { substance: MAKER_RE.test(text) && !research ? 0.7 : research ? 0.85 : 0.78, academic: true, amenity: false };
      }
      return { substance: 0.55, academic: false, amenity: false };
    case "location":
      if (RECREATION_RE.test(text) || AMENITY_RE.test(text)) {
        return research ? { substance: 0.55, academic: false, amenity: false } : { substance: 0.38, academic: false, amenity: true };
      }
      if (research) return { substance: 0.88, academic: true, amenity: false };
      if (curriculum) return { substance: 0.78, academic: true, amenity: false };
      if (/\b(?:project|atlas|program|partnership)\b/i.test(text)) return { substance: 0.72, academic: true, amenity: false };
      return { substance: 0.55, academic: false, amenity: false };
    case "organization":
      if (LISTING_RE.test(text)) return { substance: 0.4, academic: false, amenity: false };
      return { substance: PROJECT_RE.test(text) ? 0.8 : 0.7, academic: false, amenity: false };
    case "tradition":
      return { substance: research || PROJECT_RE.test(text) ? 0.6 : 0.45, academic: false, amenity: false };
    default:
      return { substance: 0.7, academic: false, amenity: false };
  }
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
