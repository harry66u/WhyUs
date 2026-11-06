/**
 * Three specific questions to ask at an info session or a current student.
 *
 * - Three different details (different kinds and activities where possible),
 *   both audiences.
 * - Each question names its detail and, where it helps, draws on what the
 *   detail's own hook says ("Since CEE 4795 has students design and assemble
 *   sensing systems, ..."), then asks what an official page rarely answers:
 *   access for newer students, timing, workload, how students actually get
 *   involved, what it is like in practice, what students do afterward.
 * - A question the fact's own text already answers is never asked (a course
 *   described as introductory is not asked about first-year access).
 * - Phrasing varies by kind, and deterministically by school and detail, so a
 *   student's dossiers do not repeat one template.
 */
import type { DossierQuestion, FactKind } from "@/lib/types";
import type { RankedDetail } from "./angles";
import { usableHook } from "./explain";
import { capitalizeFirst, hashString, tidy } from "./text";

type Audience = DossierQuestion["audience"];

interface QContext {
  /** Name as it reads mid-sentence: "CEE 4795", "Erin Mayfield", "the Water Center at Penn". */
  name: string;
  /** Grammatical subject for a hook clause ("CEE 4795", "this lab"). */
  subject: string;
  /** Shortened hook (third-person verb phrase), or null when there is no usable one. */
  hook: string | null;
  /** Short noun phrase for what the detail is about ("energy systems planning and climate mitigation"), or null. */
  topic: string | null;
}

interface Frame {
  id: string;
  audience: Audience;
  /** Skip this frame when the fact's own text already answers it. */
  answered?: RegExp;
  build: (q: QContext) => string | null;
}

const FIRST_YEAR_ANSWERED = /\b(?:first-year|first year|first- and second-year|introduct\w*|introduces|no (?:prior )?(?:experience|background)|never used|without (?:prior )?experience|any level|all levels|new to)\b/i;
const JOIN_ANSWERED = /\b(?:no (?:prior )?experience|without (?:prior )?experience|open (?:by audition )?to (?:all|any|everyone|students of any)|welcomes|by audition|audition)\b/i;
const FUNDING_ANSWERED = /\b(?:funds?|funding|grants?|stipends?|paid|awards? of)\b/i;
const OUTSIDE_ANSWERED = /\b(?:community partners?|local (?:partners?|stakeholders|community|communities|nonprofits?)|real[- ]world case|public[- ]facing|stakeholders|for (?:real )?clients|community organizations?|public school)\b/i;
const HANDS_ON_ANSWERED = /\b(?:hands-on|design and assemble|design, build|build and deploy|field (?:measurements?|trips?|sampling)|lab(?:oratory)? (?:sessions?|work)|workshop course|prototyp\w*)\b/i;
const TIMING_ANSWERED = /\b(?:every (?:fall|spring|year|term|semester)|(?:fall|spring|summer) \d{4}|offered (?:each|every))\b/i;
const ACCESS_ANSWERED = /\b(?:undergraduates? (?:join|work|can)|research assistants?|mentors? undergraduates?|senior thesis|openings? for undergraduates|pairs (?:first|undergrad)\w*)\b/i;
const STUDENT_RUN_ANSWERED = /\b(?:student-run|student-led|student-operated|for credit|earn \w+ \d+ credit|credit through)\b/i;

const since = (q: QContext, rest: string) => (q.hook ? `Since ${q.subject} ${q.hook}, ${rest}` : null);

const FRAMES: Record<FactKind, Frame[]> = {
  course: [
    { id: "course-project", audience: "current_student", answered: OUTSIDE_ANSWERED, build: (q) => `In ${q.name}, what did the final project look like, and did any of it leave the classroom?` },
    { id: "course-handson", audience: "current_student", answered: HANDS_ON_ANSWERED, build: (q) => `How much of ${q.name} is hands-on work, and how much is lectures and problem sets?` },
    { id: "course-hard", audience: "current_student", build: (q) => since(q, "which part of the course did students find hardest, and what helped them through it?") },
    { id: "course-access", audience: "info_session", answered: FIRST_YEAR_ANSWERED, build: (q) => `Can first-year students take ${q.name}, or does it usually come after the core sequence?` },
    { id: "course-timing", audience: "info_session", answered: TIMING_ANSWERED, build: (q) => `How often is ${q.name} offered, and do students outside the major get seats?` },
    { id: "course-after", audience: "info_session", build: (q) => since(q, "do students carry that work into research or a thesis afterward?") },
  ],
  major: [
    { id: "major-declare", audience: "info_session", answered: /\bdeclare\b/i, build: (q) => `When do students declare ${q.name}, and how much room does it leave for courses outside it?` },
    { id: "major-research", audience: "info_session", build: (q) => `How do students in ${q.name} find research or project work, and how early do they start?` },
    { id: "major-courses", audience: "current_student", build: (q) => `Which courses in ${q.name} did students say shaped them most, and why?` },
    { id: "major-after", audience: "current_student", build: (q) => `What did recent graduates of ${q.name} go on to do, and did the program prepare them for it?` },
  ],
  faculty: [
    { id: "faculty-start", audience: "info_session", answered: ACCESS_ANSWERED, build: (q) => `How do undergraduates usually start working with ${q.name}, and how early can they begin?` },
    {
      id: "faculty-topic",
      audience: "info_session",
      answered: ACCESS_ANSWERED,
      build: (q) => (q.topic ? `Does ${q.name} take undergraduates into research on ${q.topic}, and through a course, a paid position, or independent study?` : null),
    },
    { id: "faculty-class", audience: "current_student", build: (q) => `What is it like to take a class with ${q.name}, and does the research show up in the course?` },
    { id: "faculty-did", audience: "current_student", build: (q) => (q.topic ? `Have students you know worked with ${q.name} on ${q.topic}, and what did they actually do?` : null) },
  ],
  lab: [
    {
      id: "lab-join",
      audience: "info_session",
      answered: ACCESS_ANSWERED,
      build: (q) => `How do first- and second-year students get a spot in ${q.name}: through a course, a paid position, or by asking a professor?`,
    },
    { id: "lab-own", audience: "info_session", build: (q) => `Can a student bring their own project idea to ${q.name}, or do newcomers join an existing project?` },
    { id: "lab-first-term", audience: "current_student", build: (q) => `What did newer undergraduates in ${q.name} actually do in their first term?` },
    { id: "lab-part", audience: "current_student", build: (q) => since(q, "which part of that work do undergraduates actually do?") },
  ],
  center: [
    { id: "center-fund", audience: "info_session", answered: FUNDING_ANSWERED, build: (q) => `What does ${q.name} fund or organize for students in their first two years?` },
    { id: "center-involve", audience: "info_session", build: (q) => since(q, "how do undergraduates usually get involved, and how early?") },
    { id: "center-done", audience: "current_student", build: (q) => `What have students you know done through ${q.name}, and how did they first connect with it?` },
  ],
  facility: [
    { id: "facility-training", audience: "current_student", answered: FIRST_YEAR_ANSWERED, build: (q) => `How long does training for ${q.name} take, and how busy does it get near deadlines?` },
    { id: "facility-made", audience: "current_student", build: (q) => `What have students built or made in ${q.name} outside of class?` },
    { id: "facility-own", audience: "info_session", answered: /\b(?:own projects|open to (?:all|any|everyone|the whole))\b/i, build: (q) => `Can first-year students use ${q.name} for their own projects, or only for coursework?` },
  ],
  organization: [
    { id: "org-hours", audience: "current_student", build: (q) => `How many hours a week does ${q.name} take, and do newer members get real responsibilities?` },
    { id: "org-first", audience: "current_student", build: (q) => `What do new members of ${q.name} actually work on in their first semester?` },
    { id: "org-join", audience: "info_session", answered: JOIN_ANSWERED, build: (q) => `How do first-year students join ${q.name}, and is prior experience expected?` },
    { id: "org-faculty", audience: "info_session", answered: STUDENT_RUN_ANSWERED, build: (q) => `Does ${q.name} work with faculty or courses, or is it run entirely by students?` },
  ],
  program: [
    { id: "program-apply", audience: "info_session", answered: JOIN_ANSWERED, build: (q) => `How competitive is ${q.name}, and when in the year do students apply?` },
    { id: "program-after", audience: "info_session", build: (q) => `What do students who finish ${q.name} usually go on to do?` },
    { id: "program-differently", audience: "current_student", build: (q) => `What did students who did ${q.name} say they would do differently?` },
    { id: "program-own", audience: "current_student", build: (q) => since(q, "how much of the work do students plan themselves?") },
  ],
  tradition: [
    { id: "tradition-inside", audience: "current_student", build: (q) => `What is ${q.name} actually like from the inside, and is it worth planning around?` },
    { id: "tradition-first", audience: "info_session", build: (q) => `How are first-year students included in ${q.name}?` },
  ],
  location: [
    { id: "location-fund", audience: "info_session", answered: FUNDING_ANSWERED, build: (q) => `Does the school organize or fund student work with ${q.name}, or do students arrange it themselves?` },
    { id: "location-practice", audience: "current_student", build: (q) => `How often do students actually spend time with ${q.name}, and what does that look like in practice?` },
    { id: "location-take-part", audience: "info_session", build: (q) => since(q, "how do undergraduates take part, and how early?") },
  ],
};

/** Collections, libraries, museums, and gardens: you visit and use them, you do not train on them. */
const COLLECTION_FRAMES: Frame[] = [
  { id: "collection-courses", audience: "info_session", build: (q) => `How do undergraduates use ${q.name} in courses or projects, and can first-year students request materials directly?` },
  { id: "collection-use", audience: "current_student", build: (q) => `How often do students actually use ${q.name}, and for what kinds of work?` },
];

/** Places and resources open to everyone (bike lanes, trails, a map): no sign-up, so ask about use. */
const RESOURCE_FRAMES: Frame[] = [
  { id: "resource-organize", audience: "info_session", build: (q) => `How do students use ${q.name} day to day, and does the school organize anything around it?` },
  { id: "resource-practice", audience: "current_student", build: (q) => `How much do students actually use ${q.name}, and what is it like in practice?` },
];

function framesFor(kind: FactKind, title: string): Frame[] {
  if ((kind === "facility" || kind === "location" || kind === "center") && /\b(?:collections?|library|libraries|archives?|museums?|galler(?:y|ies)|herbarium)\b/i.test(title)) {
    return COLLECTION_FRAMES;
  }
  if ((kind === "facility" || kind === "location") && /\b(?:lanes?|network|trails?|map|stations?|paths?|routes?|parks?|river|lake|mountains?|gardens?|arboretum|natural areas?|preserves?|forests?)\b/i.test(title)) {
    return RESOURCE_FRAMES;
  }
  return FRAMES[kind] ?? FRAMES.program;
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

const MAX_HOOK = 72;
const HOOK_BREAKS = [", ", " for ", " through ", " from ", " with ", " at the ", " in ", " to ", " and "];

/** The hook, shortened at a natural break so it fits inside a question. */
function shortHook(hook: string | undefined): string | null {
  const h = usableHook(hook);
  if (!h) return null;
  if (h.length <= MAX_HOOK) return h;
  let cut = -1;
  for (const b of HOOK_BREAKS) {
    const i = h.lastIndexOf(b, MAX_HOOK);
    if (i >= 25 && i > cut) cut = i;
  }
  if (cut < 0) return null;
  return h
    .slice(0, cut)
    .replace(/\s+(?:and|or|the|a|an|of|to|for|with|in|on|at|from|by)$/i, "")
    .trim();
}

const TOPIC_VERBS = /^(?:researches|studies|investigates|examines|explores|covers|teaches|analyzes|surveys|models|maps|measures|develops|designs)\s+/i;
const TOPIC_BREAKS = /\s+(?:at|through|with|for|from|in|on|using|via|to|across|and tests|and designs|and develops|and teaches|that|which|who)\s+|,\s*/i;

/** What a faculty member or lab works on, as a short noun phrase from the hook ("energy systems planning and climate mitigation"). */
function topicOf(hook: string | undefined): string | null {
  const h = usableHook(hook);
  if (!h || !TOPIC_VERBS.test(h)) return null;
  let rest = h.replace(TOPIC_VERBS, "");
  if (/^(?:how|why|what|whether|students|undergraduates)\b/i.test(rest)) return null;
  const m = rest.match(TOPIC_BREAKS);
  if (m && m.index != null && m.index > 0) rest = rest.slice(0, m.index);
  rest = tidy(rest);
  const words = rest.split(/\s+/);
  if (words.length < 2 || words.length > 7 || rest.length > 60) return null;
  return rest;
}

function contextFor(d: RankedDetail): QContext {
  const f = d.scored.fact;
  return {
    name: d.scored.features.name,
    subject: d.scored.features.subject,
    hook: shortHook(f.hook),
    topic: f.kind === "faculty" || f.kind === "lab" ? topicOf(f.hook) : null,
  };
}

function answeredBy(frame: Frame, d: RankedDetail): boolean {
  if (!frame.answered) return false;
  const f = d.scored.fact;
  return frame.answered.test(`${f.title}\n${f.summary}\n${f.hook}\n${f.quote}`);
}

/**
 * The question for one detail and audience. Frames whose answer the fact's own
 * text already gives are skipped; among the rest, the choice rotates by school
 * and detail. Falls back to the other audience, then to any frame.
 */
function questionFor(d: RankedDetail, audience: Audience, seed: string, usedFrames: Set<string>, usedTexts: Set<string>): DossierQuestion | null {
  const frames = framesFor(d.scored.fact.kind, d.scored.fact.title);
  const q = contextFor(d);
  for (const aud of [audience, other(audience)]) {
    const list = frames.filter((fr) => fr.audience === aud && !usedFrames.has(fr.id) && !answeredBy(fr, d));
    if (list.length === 0) continue;
    const start = hashString(`${seed}|${d.scored.fact.id}|${aud}`) % list.length;
    for (let k = 0; k < list.length; k++) {
      const fr = list[(start + k) % list.length];
      const raw = fr.build(q);
      if (!raw) continue;
      const text = capitalizeFirst(raw.replace(/\s+/g, " ").trim());
      if (usedTexts.has(text)) continue;
      usedFrames.add(fr.id);
      return { text, factId: d.scored.fact.id, audience: aud };
    }
  }
  return null;
}

export interface QuestionOptions {
  /** Varies phrasing across a student's schools (e.g. the school id). */
  seed?: string;
}

/** Exactly three questions (when there is at least one detail), about three different details where possible, mixing both audiences. */
export function pickQuestions(details: RankedDetail[], opts: QuestionOptions = {}): DossierQuestion[] {
  if (details.length === 0) return [];
  const seed = opts.seed ?? "";
  const ordered = [...details].sort((a, b) => a.rank - b.rank);
  const chosen: RankedDetail[] = [];
  const sourceOf = (d: RankedDetail) => {
    const cite = d.cite !== undefined ? d.cite : d.scored.bases?.[0];
    return cite ? `${cite.kind}:${cite.sourceId}` : `fact:${d.scored.fact.id}`;
  };
  // Prefer details of different kinds that serve different activities, then relax.
  const passes: ((d: RankedDetail) => boolean)[] = [
    (d) => !chosen.some((c) => c.scored.fact.kind === d.scored.fact.kind || sourceOf(c) === sourceOf(d)),
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

  const usedFrames = new Set<string>();
  const usedTexts = new Set<string>();
  const out: DossierQuestion[] = [];
  for (const s of slots) {
    const q =
      questionFor(s.d, s.audience, seed, usedFrames, usedTexts) ??
      questionFor(s.d, s.audience, `${seed}#`, new Set(), usedTexts) ?? {
        text: `What do students say ${s.d.scored.features.name} is like in practice?`,
        factId: s.d.scored.fact.id,
        audience: s.audience,
      };
    usedTexts.add(q.text);
    out.push(q);
  }
  // Keep both audiences when the frames allowed it.
  if (out.every((q) => q.audience === out[0].audience) && out.length === 3) {
    const alt = questionFor(slots[2].d, other(out[2].audience), `${seed}~`, usedFrames, usedTexts);
    if (alt && alt.audience !== out[0].audience) out[2] = alt;
  }
  return out;
}
