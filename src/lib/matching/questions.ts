/**
 * Three specific questions to ask at an info session or a current student.
 *
 * Each question names one of the dossier's details and asks about what an
 * official page rarely answers: access for first-year students, timing,
 * workload, how students actually get involved, what it is like in practice.
 */
import type { DossierQuestion, FactKind } from "@/lib/types";
import type { RankedDetail } from "./angles";
import { capitalizeFirst } from "./text";

type Audience = DossierQuestion["audience"];

const TEMPLATES: Record<FactKind, Record<Audience, (name: string) => string>> = {
  course: {
    info_session: (n) => `Can first-year students take ${n}, or does it fill with upper-level majors first?`,
    current_student: (n) => `What does the work in ${n} look like week to week, and how much of it is hands-on?`,
  },
  major: {
    info_session: (n) => `When do students declare ${n}, and how much room does it leave for courses outside it?`,
    current_student: (n) => `Which courses in ${n} do students say shaped them most, and why?`,
  },
  faculty: {
    info_session: (n) => `How do undergraduates usually get to work with ${n}, and how early can they start?`,
    current_student: (n) => `What is it like to take a class or work on a project with ${n}?`,
  },
  lab: {
    info_session: (n) => `How do undergraduates usually join ${n}: through a course, a paid position, or by contacting faculty?`,
    current_student: (n) => `What do newer undergraduates actually do in ${n}, and how did they get started?`,
  },
  center: {
    info_session: (n) => `How do first- and second-year students get involved with ${n}, and is there funding for their projects?`,
    current_student: (n) => `What have students you know done through ${n}, and how did they first connect with it?`,
  },
  facility: {
    info_session: (n) => `Can first-year students use ${n} for their own projects, or only for coursework?`,
    current_student: (n) => `How long does training for ${n} take, and how busy does it get during the term?`,
  },
  organization: {
    info_session: (n) => `How do first-year students join ${n}, and is prior experience expected?`,
    current_student: (n) => `How many hours a week does ${n} take, and do newer members get real responsibilities?`,
  },
  program: {
    info_session: (n) => `How competitive is ${n}, and when in the year do students apply?`,
    current_student: (n) => `What did students who did ${n} say they would do differently?`,
  },
  tradition: {
    info_session: (n) => `How are first-year students included in ${n}?`,
    current_student: (n) => `What is ${n} actually like from the inside, and is it worth planning around?`,
  },
  location: {
    info_session: (n) => `How do undergraduates get involved with ${n}, and does the school organize or fund that work?`,
    current_student: (n) => `How often do students actually spend time with ${n}, and what does that look like in practice?`,
  },
};

/** Collections, libraries, museums, and gardens: you visit and use them, you do not train on them. */
const COLLECTION_TEMPLATES: Record<Audience, (name: string) => string> = {
  info_session: (n) => `How do undergraduates use ${n} in courses or projects, and can first-year students request materials directly?`,
  current_student: (n) => `How often do students actually use ${n}, and for what kinds of work?`,
};

/** Places and resources open to everyone (bike lanes, trails, a map): no sign-up, so ask about use. */
const RESOURCE_TEMPLATES: Record<Audience, (name: string) => string> = {
  info_session: (n) => `How do students use ${n} day to day, and does the school organize anything around it?`,
  current_student: (n) => `How much do students actually use ${n}, and what is it like in practice?`,
};

function templateFor(kind: FactKind, title: string, audience: Audience): (name: string) => string {
  if ((kind === "facility" || kind === "location" || kind === "center") && /\b(?:collections?|library|libraries|archives?|museums?|galler(?:y|ies)|herbarium)\b/i.test(title)) {
    return COLLECTION_TEMPLATES[audience];
  }
  if ((kind === "facility" || kind === "location") && /\b(?:lanes?|network|trails?|map|stations?|paths?|routes?|parks?|river|lake|mountains?|gardens?|arboretum|natural areas?|preserves?|forests?)\b/i.test(title)) {
    return RESOURCE_TEMPLATES[audience];
  }
  return TEMPLATES[kind]?.[audience] ?? TEMPLATES.program[audience];
}

/** Which audience a kind of detail suits best. */
const PREFERRED: Record<FactKind, Audience> = {
  course: "current_student",
  major: "info_session",
  faculty: "info_session",
  lab: "info_session",
  center: "info_session",
  facility: "current_student",
  organization: "current_student",
  program: "info_session",
  tradition: "current_student",
  location: "current_student",
};

const other = (a: Audience): Audience => (a === "info_session" ? "current_student" : "info_session");

function questionFor(d: RankedDetail, audience: Audience): DossierQuestion {
  const kind = d.scored.fact.kind;
  const name = d.scored.features.name;
  const text = capitalizeFirst(templateFor(kind, d.scored.fact.title, audience)(name));
  return { text, factId: d.scored.fact.id, audience };
}

/** Exactly three questions (when there is at least one detail), mixing both audiences. */
export function pickQuestions(details: RankedDetail[]): DossierQuestion[] {
  if (details.length === 0) return [];
  const ordered = [...details].sort((a, b) => a.rank - b.rank);
  const chosen: RankedDetail[] = [];
  const activityOf = (d: RankedDetail) => d.scored.links[0]?.source.id ?? `fact:${d.scored.fact.id}`;
  // Prefer details of different kinds that serve different activities, then relax.
  const passes: ((d: RankedDetail) => boolean)[] = [
    (d) => !chosen.some((c) => c.scored.fact.kind === d.scored.fact.kind || activityOf(c) === activityOf(d)),
    (d) => !chosen.some((c) => c.scored.fact.kind === d.scored.fact.kind),
    () => true,
  ];
  for (const ok of passes) {
    for (const d of ordered) {
      if (chosen.length >= 3) break;
      if (!chosen.includes(d) && ok(d)) chosen.push(d);
    }
  }
  chosen.sort((a, b) => a.rank - b.rank);
  const slots: { d: RankedDetail; audience: Audience }[] = chosen.map((d) => ({ d, audience: PREFERRED[d.scored.fact.kind] ?? "info_session" }));
  // Fewer than three details: ask about the same detail from the other side.
  for (let i = 0; slots.length < 3; i++) {
    const s = slots[i % slots.length];
    slots.push({ d: s.d, audience: other(s.audience) });
  }
  if (slots.every((s) => s.audience === slots[0].audience)) slots[2].audience = other(slots[2].audience);
  const seen = new Set<string>();
  return slots.map((s) => {
    let q = questionFor(s.d, s.audience);
    if (seen.has(q.text)) q = questionFor(s.d, other(s.audience));
    seen.add(q.text);
    return q;
  });
}
