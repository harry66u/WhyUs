/**
 * Draft checker: points out problems in a student's own draft. It never
 * rewrites, suggests replacement sentences, or generates prose.
 *
 * - Word count (/\S+/ tokens) against the application's limit.
 * - Every school-specific claim (course codes, professors, labs, centers,
 *   programs, clubs, quoted names, majors, places) is checked against the
 *   school's verified facts, then against cached official pages for the exact
 *   phrase. Confirmed claims cite the page and date; anything else is flagged
 *   as "could not confirm", never "fixed".
 * - Names of the other schools on the student's list (and their units, towns,
 *   and verified details) are flagged as belonging to another school.
 * - Swap test per sentence: a sentence whose school-specific details all have
 *   equivalents at another school on the list could go in that essay too.
 * - Generic sentences: stock phrases, praise, and "opportunities" talk with
 *   nothing specific.
 *
 * Deterministic. When Claude is configured it may add spans the patterns
 * missed; those are used only if they occur verbatim in the draft, and they go
 * through the same verification. The draft is never stored.
 */
import { llmAvailable } from "@/lib/llm/client";
import { isVerifiedFact, swapTest, type OtherSchool } from "@/lib/matching/swap";
import { getSchoolFacts } from "@/lib/research/corpus-store";
import { currentTerm, isoDate, verifiedThisTerm } from "@/lib/research/term";
import { getSchool } from "@/lib/schools/registry";
import type { Activity, DraftIssueType, Fact, FactKind, School } from "@/lib/types";
import { extractClaims, resolveOverlaps, type Claim, type ClaimKind } from "./claims";
import { buildFactIndex, matchElsewhere, matchHere, nearMiss, scanKnownNames, type FactIndex, type FactMatch, type KnownHit } from "./facts-index";
import { detectGeneric } from "./generic";
import { FIRST_PERSON, FUTURE_CUES, GENERIC_UNIT_WORDS, CONNECTORS } from "./lexicon";
import { extractClaimsWithClaude, type ExtractedClaim } from "./llm";
import { genericMessage, swapMessage, UNVERIFIED_MESSAGE, verifiedMessage, wordCountMessage, wrongSchoolMessage } from "./messages";
import { PageCorpus, type CachedPage } from "./page-search";
import type { CheckedDraft, CheckedIssue } from "./present";
import { loadCachedOfficialPages } from "./pages";
import { buildRefPatterns, findSchoolRefs, ownNames, type SchoolRef } from "./schools";
import { containsWords, countWords, normalizeWithMap, normName, segmentDraft, sentenceAt, type Sentence, type TextRange } from "./text";

export interface DraftCheckInput {
  text: string;
  schoolId: string;
  unitId: string | null;
  wordLimit: number | null;
  /** Other schools on the student's list, for the swap test. */
  otherSchoolIds: string[];
  /** The unit applied to at each other school (scopes the swap test like the dossiers). */
  otherSchools?: { schoolId: string; unitId: string | null }[];
  /** The student's own activities and places, so their past is not mistaken for claims about the school. */
  student?: { activities?: Activity[]; location?: string | null; highSchool?: string | null };
}

export interface DraftCheckDeps {
  getSchool(id: string): School | undefined;
  /** Verified facts for a school (all units). */
  loadFacts(schoolId: string): Promise<Fact[]>;
  /** Cached official pages for a school, read this term. Called only when a claim is not in the facts. */
  loadPages(school: School): Promise<CachedPage[]>;
  /** Optional extra spans (never rewrites). Items not found verbatim in the draft are dropped. */
  extractClaims?: (text: string, ctx: { schoolName: string }) => Promise<ExtractedClaim[]>;
  now(): Date;
}

function defaultDeps(): DraftCheckDeps {
  return {
    getSchool,
    loadFacts: (schoolId) => getSchoolFacts(schoolId),
    loadPages: (school) => loadCachedOfficialPages(school),
    extractClaims: llmAvailable() ? (text, ctx) => extractClaimsWithClaude(text, ctx) : undefined,
    now: () => new Date(),
  };
}

/* ------------------------------------------------------------------ */
/* Evidence for one mention                                             */
/* ------------------------------------------------------------------ */

type Evidence =
  | { status: "verified"; fact: Fact; via: "name" | "quote" }
  | { status: "verified_page"; page: CachedPage }
  | {
      status: "elsewhere";
      schools: School[];
      message: string;
      confidence: "high" | "low";
      sourceUrl?: string;
      verifiedAt?: string;
    }
  | { status: "unverified"; near: Fact | null }
  | { status: "ignored" };

interface Mention extends TextRange {
  sentence: number;
  evidence: Evidence;
  claim?: Claim;
  /** Set when the evidence came from another school's name in the possessive right before the claim. */
  viaPossessor?: boolean;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Most recent day a fact was confirmed on its page. */
function verifiedDay(f: Fact): string | undefined {
  const days: string[] = [];
  if (f.verifiedAt && ISO_DAY.test(f.verifiedAt.slice(0, 10))) days.push(f.verifiedAt.slice(0, 10));
  if (f.verification?.status === "verified" && f.verification.checkedAt && ISO_DAY.test(f.verification.checkedAt.slice(0, 10))) {
    days.push(f.verification.checkedAt.slice(0, 10));
  }
  return days.sort().pop();
}

function displayName(s: School): string {
  return s.shortName || s.name;
}

function guessKind(c: Claim): FactKind {
  const words = normName(c.query).split(" ");
  const last = words[words.length - 1] ?? "";
  switch (c.kind) {
    case "course":
      return "course";
    case "person":
      return "faculty";
    case "major":
      return "major";
    case "place":
      return "location";
    default:
      if (/^(?:lab|labs|laboratory|laboratories)$/.test(last)) return "lab";
      if (words.some((w) => /^(?:center|centre|institute)$/.test(w))) return "center";
      if (/^(?:club|team|society|ensemble|orchestra|choir|chorus|union|collective)$/.test(last)) return "organization";
      if (/^(?:studio|shop|workshop|workshops|station|observatory|museum|library|farm|garden|gardens|lodge)$/.test(last)) return "facility";
      return "program";
  }
}

/** A stand-in fact for a claim confirmed on a cached page (no corpus entry), for the swap test. */
function pageFact(c: Claim, page: CachedPage, school: School, now: Date): Fact {
  return {
    id: `draft:${school.id}:${normName(c.query)}`,
    schoolId: school.id,
    unitIds: [],
    kind: guessKind(c),
    title: c.query,
    nameOnPage: c.query,
    summary: "",
    hook: "",
    quote: "",
    sourceUrl: page.url,
    sourceTitle: page.title,
    themes: [],
    commonness: "moderate",
    term: currentTerm(now),
    verifiedAt: isoDate(new Date(page.fetchedAt)),
  };
}

const LLM_KIND: Record<ExtractedClaim["kind"], ClaimKind> = {
  course: "course",
  person: "person",
  organization: "name",
  program: "name",
  facility: "name",
  place: "place",
  major: "major",
  other_school: "name",
  other: "name",
};

/** Claude's spans become claims only where their text occurs verbatim in the draft. */
function claimsFromExtraction(found: ExtractedClaim[], text: string, sentences: Sentence[]): Claim[] {
  const out: Claim[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(found) ? found : []) {
    const t = typeof item?.text === "string" ? item.text.trim() : "";
    if (t.length < 2 || t.length > 120 || seen.has(t)) continue;
    seen.add(t);
    let kind: ClaimKind = LLM_KIND[item.kind] ?? "name";
    let query = t;
    if (kind === "course" && !/^[A-Za-z]{2,8}(?:&[A-Za-z]{1,3})?[\s -]?\d/.test(t)) kind = "name";
    if (kind === "person") query = t.replace(/^(?:professors?|prof\.?|dr\.?|doctor)\s+/i, "").trim();
    if (!query) continue;
    for (let from = 0, i = text.indexOf(t); i >= 0 && out.length < 200; from = i + t.length, i = text.indexOf(t, from)) {
      const s = sentenceAt(sentences, i);
      if (!s || i + t.length > s.end) continue;
      out.push({ kind, start: i, end: i + t.length, text: t, query, sentence: s.index, origin: "llm" });
    }
  }
  return out;
}

function overlaps(a: TextRange, b: TextRange): boolean {
  return a.start < b.end && b.start < a.end;
}

const TYPE_ORDER: Record<DraftIssueType, number> = {
  word_count: 0,
  wrong_school: 1,
  unverified_claim: 2,
  swappable: 3,
  generic: 4,
  verified_claim: 5,
};

const EXCERPT_MAX = 220;

/* ------------------------------------------------------------------ */
/* checkDraft                                                           */
/* ------------------------------------------------------------------ */

export async function checkDraft(input: DraftCheckInput, deps: Partial<DraftCheckDeps> = {}): Promise<CheckedDraft> {
  const d: DraftCheckDeps = { ...defaultDeps(), ...deps };
  const now = d.now();
  const text = typeof input.text === "string" ? input.text : "";
  const school = d.getSchool(input.schoolId);
  if (!school) throw new Error(`Unknown school: ${input.schoolId}`);
  const name = displayName(school);

  const wordCount = countWords(text);
  const wordLimit = typeof input.wordLimit === "number" && Number.isFinite(input.wordLimit) && input.wordLimit > 0 ? Math.floor(input.wordLimit) : null;
  const seg = segmentDraft(text);
  const issues: CheckedIssue[] = [];
  const excerpt = (r: TextRange) => {
    const t = text.slice(r.start, r.end);
    return t.length > EXCERPT_MAX ? `${t.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : t;
  };
  const finish = (genericSentences: number): CheckedDraft => {
    issues.sort(
      (a, b) =>
        (a.range ? 1 : 0) - (b.range ? 1 : 0) ||
        (a.range?.start ?? 0) - (b.range?.start ?? 0) ||
        TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
        (b.range?.end ?? 0) - (a.range?.end ?? 0),
    );
    return {
      wordCount,
      wordLimit,
      withinLimit: wordLimit === null ? null : wordCount <= wordLimit,
      issues,
      summary: {
        verifiedClaims: issues.filter((i) => i.type === "verified_claim").length,
        unverifiedClaims: issues.filter((i) => i.type === "unverified_claim").length,
        genericSentences,
        swappableSentences: issues.filter((i) => i.type === "swappable").length,
        sentences: seg.sentences.length,
      },
      checkedAt: now.toISOString(),
    };
  };

  if (wordLimit !== null && wordCount > wordLimit) {
    issues.push({ type: "word_count", severity: "problem", message: wordCountMessage(wordCount, wordLimit) });
  }
  if (seg.sentences.length === 0) return finish(0);

  /* Schools and their research bases ------------------------------- */
  const specs = new Map<string, string | null>();
  for (const o of input.otherSchools ?? []) if (o?.schoolId && !specs.has(o.schoolId)) specs.set(o.schoolId, o.unitId ?? null);
  for (const id of input.otherSchoolIds ?? []) if (id && !specs.has(id)) specs.set(id, null);
  specs.delete(school.id);
  const others = [...specs.entries()]
    .map(([schoolId, unitId]) => ({ school: d.getSchool(schoolId), unitId }))
    .filter((o): o is { school: School; unitId: string | null } => Boolean(o.school));

  // Optional extra spans; any failure (thrown or rejected) leaves the patterns to do the work.
  const extract = d.extractClaims;
  const extraction: Promise<ExtractedClaim[]> = extract
    ? Promise.resolve()
        .then(() => extract(text, { schoolName: school.name }))
        .catch(() => [])
    : Promise.resolve([]);
  const factLists = await Promise.all([d.loadFacts(school.id), ...others.map((o) => d.loadFacts(o.school.id))]);
  const usable = (list: Fact[], s: School) => (list ?? []).filter((f) => f && f.schoolId === s.id && isVerifiedFact(f));
  const here = buildFactIndex(school, usable(factLists[0], school));
  const elsewhere: FactIndex[] = others.map((o, i) => buildFactIndex(o.school, usable(factLists[i + 1], o.school)));
  const knownPrefixes = new Set([...here.prefixes, ...elsewhere.flatMap((x) => [...x.prefixes])]);

  const hay = normalizeWithMap(text);
  const ownKeys = ownNames(school);
  const ownUnitNames = [school.name, ...(school.units ?? []).map((u) => u.name)].map(normName).filter(Boolean);
  /** The current school's names that say "this school" (not generic words like "Engineering"). */
  const mentionKeys = [...ownKeys].filter((k) => k.split(" ").some((t) => !GENERIC_UNIT_WORDS.has(t) && !CONNECTORS.has(t)));
  const otherNameSets = others.map((o) => ({ school: o.school, names: ownNames(o.school) }));

  /* Mentions -------------------------------------------------------- */
  const ignorePlaces = [input.student?.location, input.student?.highSchool].filter((p): p is string => Boolean(p && p.trim()));
  const refs = findSchoolRefs(
    text,
    hay,
    buildRefPatterns(
      school,
      others.map((o) => o.school),
      { ignorePlaces, currentPrefixes: here.prefixes },
    ),
  );
  const knownHere = scanKnownNames(text, hay, here, { distinctiveOnly: false });
  const knownElsewhere = elsewhere.flatMap((idx) => scanKnownNames(text, hay, idx, { distinctiveOnly: true }).map((hit) => ({ hit, idx })));
  const patternClaims = extractClaims(text, seg.sentences, { knownPrefixes });
  const llmClaims = resolveOverlaps(claimsFromExtraction(await extraction, text, seg.sentences).filter((c) => !patternClaims.some((p) => overlaps(p, c))));

  type Candidate =
    | (TextRange & { type: "ref"; refs: SchoolRef[]; priority: number })
    | (TextRange & { type: "known"; hit: KnownHit; idx: FactIndex; here: boolean; priority: number })
    | (TextRange & { type: "claim"; claim: Claim; priority: number; inner: SchoolRef[] });

  const refGroups = new Map<string, SchoolRef[]>();
  for (const r of refs) {
    const k = `${r.start}:${r.end}`;
    refGroups.set(k, [...(refGroups.get(k) ?? []), r]);
  }
  const candidates: Candidate[] = [
    ...[...refGroups.values()].map((g) => ({ type: "ref" as const, start: g[0].start, end: g[0].end, refs: g, priority: g.some((r) => r.confidence === "high") ? 3 : 1 })),
    ...knownHere.map((hit) => ({ type: "known" as const, start: hit.start, end: hit.end, hit, idx: here, here: true, priority: 3 })),
    ...knownElsewhere.map(({ hit, idx }) => ({ type: "known" as const, start: hit.start, end: hit.end, hit, idx, here: false, priority: 2 })),
    ...[...patternClaims, ...llmClaims].map((claim) => ({ type: "claim" as const, start: claim.start, end: claim.end, claim, priority: 0, inner: [] as SchoolRef[] })),
  ];
  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || b.priority - a.priority || a.start - b.start);
  const selected: Candidate[] = [];
  for (const c of candidates) {
    const clash = selected.find((s) => overlaps(s, c));
    if (!clash) selected.push(c);
    else if (c.type === "ref" && clash.type === "claim" && c.start >= clash.start && c.end <= clash.end) clash.inner.push(...c.refs);
  }

  const sentenceOf = (r: TextRange) => sentenceAt(seg.sentences, r.start)?.index ?? 0;

  const activityTexts = [
    ...(input.student?.activities ?? []).flatMap((a) => [normName(`${a.title ?? ""}`), normName(`${a.organization ?? ""}`), normName(`${a.description ?? ""}`)]),
    normName(input.student?.highSchool ?? ""),
    normName(input.student?.location ?? ""),
  ].filter(Boolean);

  const mentionsSchool = (sentenceText: string) => {
    const n = normName(sentenceText);
    return mentionKeys.some((k) => containsWords(n, k));
  };

  /** The student's own past: an activity of theirs, or a first-person sentence with no school or future in it. */
  const personal = (c: Claim): boolean => {
    const key = normName(c.query);
    if (key && activityTexts.some((t) => containsWords(t, key))) return true;
    // "Example's Heron Lab" is about the school; "Sam's Robotics Club" is judged like any other name.
    if (c.possessor && ownKeys.has(normName(c.possessor))) return false;
    const s = seg.sentences[c.sentence];
    const st = text.slice(s.start, s.end);
    if (FUTURE_CUES.test(st) || mentionsSchool(st)) return false;
    return FIRST_PERSON.test(st);
  };

  const isOwnName = (key: string) => ownKeys.has(key) || (key.split(" ").length >= 2 && ownUnitNames.some((n) => containsWords(n, key)));

  const possessorSchool = (possessor: string | undefined): { school: School; current: boolean } | null => {
    if (!possessor) return null;
    const k = normName(possessor);
    if (ownKeys.has(k)) return { school, current: true };
    const hit = otherNameSets.find((o) => o.names.has(k));
    return hit ? { school: hit.school, current: false } : null;
  };

  const fromRefs = (group: SchoolRef[]): Evidence => {
    const schools = [...new Map(group.map((r) => [r.school.id, r.school])).values()];
    const names = schools.map(displayName);
    const first = group[0];
    const message =
      first.kind === "unit"
        ? wrongSchoolMessage({ kind: "unit", schools: names, unitName: schools.length === 1 ? first.unitName : undefined })
        : first.kind === "city"
          ? wrongSchoolMessage({ kind: "city", schools: names, city: first.text })
          : wrongSchoolMessage({ kind: first.kind, schools: names });
    return { status: "elsewhere", schools, message, confidence: group.some((r) => r.confidence === "high") ? "high" : "low" };
  };

  const fromOtherFact = (s: School, fact: Fact): Evidence => ({
    status: "elsewhere",
    schools: [s],
    message: wrongSchoolMessage({ kind: "fact", schools: [displayName(s)], title: fact.title }),
    confidence: "high",
    sourceUrl: fact.sourceUrl,
    verifiedAt: verifiedDay(fact),
  });

  const fromMatch = (m: FactMatch): Evidence => ({ status: "verified", fact: m.fact, via: m.via });

  const mentions: Mention[] = [];
  const pending: Mention[] = [];
  for (const c of selected) {
    const sentence = sentenceOf(c);
    if (c.type === "ref") {
      mentions.push({ start: c.start, end: c.end, sentence, evidence: fromRefs(c.refs) });
      continue;
    }
    if (c.type === "known") {
      const evidence: Evidence = c.here ? { status: "verified", fact: c.hit.entry.fact, via: "name" } : fromOtherFact(c.idx.school, c.hit.entry.fact);
      mentions.push({ start: c.start, end: c.end, sentence, evidence });
      continue;
    }
    const claim = c.claim;
    const key = normName(claim.query);
    const base = { start: claim.start, end: claim.end, sentence: claim.sentence, claim };
    if (!key || isOwnName(key)) {
      mentions.push({ ...base, evidence: { status: "ignored" } });
      continue;
    }
    const owner = possessorSchool(claim.possessor);
    if (!owner || owner.current) {
      const m = matchHere(claim, here);
      if (m) {
        mentions.push({ ...base, evidence: fromMatch(m) });
        continue;
      }
    }
    if (c.inner.length > 0) {
      mentions.push({ ...base, evidence: fromRefs(c.inner) });
      continue;
    }
    if (owner && !owner.current) {
      const m = elsewhere.find((x) => x.school.id === owner.school.id);
      const fact = m ? matchHere(claim, m)?.fact : undefined;
      const evidence: Evidence = fact
        ? fromOtherFact(owner.school, fact)
        : { status: "elsewhere", schools: [owner.school], message: wrongSchoolMessage({ kind: "school", schools: [displayName(owner.school)] }), confidence: "high" };
      mentions.push({ ...base, evidence, viaPossessor: true });
      continue;
    }
    const other = elsewhere.map((idx) => ({ idx, m: matchElsewhere(claim, idx, here.prefixes) })).find((x) => x.m);
    if (other?.m) {
      mentions.push({ ...base, evidence: fromOtherFact(other.idx.school, other.m.fact) });
      continue;
    }
    const mention: Mention = { ...base, evidence: { status: "ignored" } };
    mentions.push(mention);
    pending.push(mention);
  }

  // Claims not in the research base: look for the exact phrase on cached official pages.
  if (pending.length > 0) {
    let corpus: PageCorpus;
    try {
      corpus = new PageCorpus(await d.loadPages(school));
    } catch {
      corpus = new PageCorpus([]);
    }
    for (const m of pending) {
      const claim = m.claim as Claim;
      const page = corpus.find(claim);
      if (page) m.evidence = { status: "verified_page", page };
      else if (claim.kind === "acronym" || personal(claim)) m.evidence = { status: "ignored" };
      else m.evidence = { status: "unverified", near: nearMiss(claim, here) };
    }
  }

  // "Cornell's Lab of Ornithology": one note for the possessive and the name.
  for (const m of mentions) {
    if (!m.viaPossessor) continue;
    const ref = mentions.find((r) => !r.claim && r.evidence.status === "elsewhere" && r.end <= m.start && /^['’]s[ \t ]+$/.test(text.slice(r.end, m.start)));
    if (ref) {
      m.start = ref.start;
      ref.evidence = { status: "ignored" };
    }
  }

  /* Issues ------------------------------------------------------------ */
  const verifiedBySentence = new Map<number, Fact[]>();
  for (const m of mentions) {
    const range = { start: m.start, end: m.end };
    const e = m.evidence;
    switch (e.status) {
      case "verified": {
        issues.push({
          type: "verified_claim",
          severity: "info",
          message: verifiedMessage(name, { title: e.fact.title, via: e.via }),
          range,
          excerpt: excerpt(range),
          sourceUrl: e.fact.sourceUrl,
          verifiedAt: verifiedDay(e.fact),
          matchedTitle: e.fact.title,
          ...(e.fact.sourceTitle ? { sourceTitle: e.fact.sourceTitle } : {}),
        });
        verifiedBySentence.set(m.sentence, [...(verifiedBySentence.get(m.sentence) ?? []), e.fact]);
        break;
      }
      case "verified_page": {
        issues.push({
          type: "verified_claim",
          severity: "info",
          message: verifiedMessage(name, { via: "page" }),
          range,
          excerpt: excerpt(range),
          sourceUrl: e.page.url,
          verifiedAt: isoDate(new Date(e.page.fetchedAt)),
          ...(e.page.title ? { sourceTitle: e.page.title } : {}),
        });
        if (m.claim) verifiedBySentence.set(m.sentence, [...(verifiedBySentence.get(m.sentence) ?? []), pageFact(m.claim, e.page, school, now)]);
        break;
      }
      case "elsewhere":
        issues.push({
          type: "wrong_school",
          severity: e.confidence === "high" ? "problem" : "warning",
          message: e.message,
          range,
          excerpt: excerpt(range),
          otherSchools: e.schools.map((s) => ({ schoolId: s.id, schoolName: displayName(s) })),
          ...(e.sourceUrl ? { sourceUrl: e.sourceUrl } : {}),
          ...(e.verifiedAt ? { verifiedAt: e.verifiedAt } : {}),
        });
        break;
      case "unverified":
        issues.push({
          type: "unverified_claim",
          severity: "warning",
          message: UNVERIFIED_MESSAGE,
          range,
          excerpt: excerpt(range),
          ...(e.near ? { sourceUrl: e.near.sourceUrl } : {}),
        });
        break;
      case "ignored":
        break;
    }
  }

  // Swap test per sentence, against the other schools' verified research (scoped like the dossiers).
  const swapOthers: OtherSchool[] = others.map((o, i) => ({
    school: o.school,
    facts: usable(factLists[i + 1], o.school).filter(
      (f) => verifiedThisTerm(f.verifiedAt, now) && (!o.unitId || (f.unitIds ?? []).length === 0 || f.unitIds.includes(o.unitId)),
    ),
  }));
  if (swapOthers.length > 0) {
    for (const [index, facts] of verifiedBySentence) {
      const sentence = seg.sentences[index];
      if (!sentence) continue;
      const results = facts.map((f) => swapTest(f, swapOthers));
      const schools: { schoolId: string; schoolName: string; equivalentTitle?: string }[] = [];
      for (const o of swapOthers) {
        const per = results.map((r) => r.find((x) => x.schoolId === o.school.id));
        if (per.length > 0 && per.every((x) => x?.status === "equivalent")) {
          schools.push({ schoolId: o.school.id, schoolName: displayName(o.school), ...(per[0]?.equivalentTitle ? { equivalentTitle: per[0].equivalentTitle } : {}) });
        }
      }
      if (schools.length > 0) {
        const range = { start: sentence.start, end: sentence.end };
        issues.push({ type: "swappable", severity: "warning", message: swapMessage(schools.map((s) => s.schoolName)), range, excerpt: excerpt(range), otherSchools: schools });
      }
    }
  }

  // Generic sentences: any mention at all (even one we could not confirm) makes a sentence specific.
  const specific = new Set<number>(selected.map((c) => sentenceOf(c)));
  const flags = detectGeneric(text, seg.sentences, { specific, schoolNames: mentionKeys });
  for (const f of flags) {
    issues.push({ type: "generic", severity: f.level === "sentence" ? "warning" : "info", message: genericMessage(f, name), range: f.range, excerpt: excerpt(f.range) });
  }

  return finish(new Set(flags.filter((f) => f.level === "sentence").map((f) => f.sentence)).size);
}
