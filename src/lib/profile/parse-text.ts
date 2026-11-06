/**
 * Deterministic activity parser.
 *
 * Reads the layouts students actually have:
 * - the Common App activities section with field labels ("Activity type",
 *   "Position/Leadership description", "Organization Name", ...), as copied from
 *   the application or extracted from its PDF;
 * - the numbered printed layout ("1. Environmental", a position and organization
 *   line, the description, and grade levels, timing, and hours/weeks lines);
 * - resumes: section headings with entries and bullet points;
 * - plain lists: one activity per paragraph or line.
 *
 * It never invents anything: every title, role, organization, and description
 * is copied from the source text (whitespace is collapsed and bullet glyphs are
 * dropped; bullet points of one entry are joined with "; ").
 */
import type { Activity } from "@/lib/types";
import { COMMON_APP_LIMITS, canonicalActivityType, matchActivityTypePrefix } from "./common-app";

export type ActivitySourceFormat = "commonapp" | "commonapp-numbered" | "resume" | "list";

export type ActivityDraft = Omit<Activity, "id">;

export interface DeterministicParse {
  activities: Activity[];
  format: ActivitySourceFormat;
  /** True when the text is a recognized Common App layout and every activity parsed cleanly. */
  confident: boolean;
  warnings: string[];
}

/** Activities beyond this are dropped (the Common App lists 10; resumes can list more). */
export const MAX_PARSED_ACTIVITIES = 40;

const MAX_LINE_FOR_PATTERNS = 2000;

/* ------------------------------------------------------------------ */
/* Text preparation                                                    */
/* ------------------------------------------------------------------ */

interface Line {
  /** Original spacing kept (tabs expanded) so wide column gaps can be detected. */
  raw: string;
  /** Whitespace collapsed and trimmed. Empty for blank lines. */
  text: string;
}

const NOISE_LINES = [/^page\s+\d+(?:\s+of\s+\d+)?$/i, /^\d+\s*(?:\/|of)\s*\d+$/i, /^[\s_\-=.·•*~]{3,}$/];

/** Normalizes line breaks and invisible characters without changing any words. */
export function normalizeSourceText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2028\u2029\f\v]/g, "\n")
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, " ")
    .replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, "")
    .replace(/\t/g, "    ");
}

function prepareLines(text: string): Line[] {
  return normalizeSourceText(text)
    .split("\n")
    .map((raw) => ({ raw: raw.replace(/\s+$/, ""), text: raw.replace(/\s+/g, " ").trim() }))
    .map((l) => (NOISE_LINES.some((re) => re.test(l.text)) ? { raw: "", text: "" } : l));
}

function clean(value: string | undefined | null): string | undefined {
  if (value == null) return undefined;
  const v = value.replace(/\s+/g, " ").trim();
  return v.length > 0 ? v : undefined;
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function startsLowercase(s: string): boolean {
  return /^[a-z(]/.test(s);
}

/** Text of a short clause from the start of `text`, used as a title when nothing else names the activity. */
export function firstClause(text: string, max = 60): string {
  const m = /^(.+?)(?:[.;:!?](?=\s|$)|\s[-–—]\s)/.exec(text);
  let s = (m ? m[1] : text).trim();
  if (s.length > max) {
    s = s.slice(0, max);
    const space = s.lastIndexOf(" ");
    if (space > 20) s = s.slice(0, space);
  }
  return s.replace(/[\s,;:–—-]+$/, "");
}

function joinParts(parts: string[]): string {
  let out = "";
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (!out) out = part;
    else out += /[.;:!?]$/.test(out) ? ` ${part}` : `; ${part}`;
  }
  return out;
}

function parseHours(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /\d{1,3}(?:\.\d+)?/.exec(value);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0 && n <= 168 ? n : undefined;
}

function parseWeeks(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /\d{1,2}/.exec(value);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isInteger(n) && n >= 0 && n <= 52 ? n : undefined;
}

const GRADE_TOKEN = String.raw`(?:9|10|11|12|pg|post[- ]?graduate)`;
const GRADE_LIST_RE = new RegExp(String.raw`^(?:${GRADE_TOKEN}\b[\s,;&/]*(?:and\s+)?){1,6}$`, "i");

/** "10 11 12" and "10, 11, and 12" read as "10, 11, 12"; anything else is kept as written. */
function normalizeGrades(value: string | undefined): string | undefined {
  const v = clean(value?.replace(/^(?:participation\s+)?grade(?:\s+levels?|s)?\s*[:\-–—]?\s*/i, ""));
  if (!v) return undefined;
  if (GRADE_LIST_RE.test(v)) {
    const toks = v.match(new RegExp(GRADE_TOKEN, "gi")) ?? [];
    return toks.map((t) => (/^p/i.test(t) ? "Post-graduate" : t)).join(", ");
  }
  return v;
}

/* ------------------------------------------------------------------ */
/* Role and organization                                               */
/* ------------------------------------------------------------------ */

const ROLE_WORDS =
  /\b(?:co-?founder|founder|president|vice[- ]president|vp|treasurer|secretary|historian|co-?captain|captain|co-?lead|lead|leader|member|volunteer|intern|director|editor(?:-in-chief)?|chair(?:person)?|co-?chair|manager|officer|coordinator|tutor|mentor|assistant|researcher|organizer|head|coach|instructor|representative|delegate|player|principal|concertmaster|cashier|counsel(?:l)?or|lifeguard|developer|engineer|designer|analyst|writer|reporter|photographer|ambassador|apprentice|associate|participant|competitor|interpreter|translator|teacher|section leader|first chair|starter|owner|creator|host|hostess|producer|performer|soloist|musician|employee|server|barista|clerk|cook|chef|dishwasher|waiter|waitress|busser|referee|umpire|usher|driver|sitter|babysitter|nanny|caregiver|guide|fellow|webmaster|programmer|liaison|advocate|canvasser|trainee|goalkeeper|athlete|rower|swimmer|runner|dancer|artist|actor|singer|vocalist|pianist|violinist|cellist|trumpeter|drummer|stage manager|technician|moderator|facilitator|advis[eo]r|altar server|independent project)s?\b/i;

function hasRoleWord(s: string): boolean {
  return ROLE_WORDS.test(s);
}

export interface RoleOrg {
  title: string;
  role?: string;
  organization?: string;
}

/**
 * Splits a header like "Founder, Creek Watch" or "Jazz Ensemble | Lead trumpet"
 * into role and organization, using role words to decide which side is which.
 * In "role-first" mode (the Common App's "Position, Organization" line) an
 * ambiguous comma split puts the position first.
 */
export function splitRoleOrg(text: string, mode: "role-first" | "auto" = "auto"): RoleOrg {
  const t = text.trim();
  const at = /^(.{2,60}?)\s+at\s+(.{2,})$/i.exec(t);
  if (at && (hasRoleWord(at[1]) || wordCount(at[1]) <= 4)) {
    return { title: at[2].trim(), role: at[1].trim(), organization: at[2].trim() };
  }
  const paren = /^(.{2,}?)\s*\(([^()]{2,60})\)$/.exec(t);
  if (paren && hasRoleWord(paren[2]) && !hasRoleWord(paren[1])) {
    return { title: paren[1].trim(), role: paren[2].trim(), organization: paren[1].trim() };
  }
  const sep = /\s[|–—]\s|\s-\s|,\s/.exec(t);
  if (sep) {
    const a = t.slice(0, sep.index).trim();
    const b = t.slice(sep.index + sep[0].length).trim();
    if (a && b) {
      const ra = hasRoleWord(a);
      const rb = hasRoleWord(b);
      if (ra && !rb) return { title: b, role: a, organization: b };
      if (rb && !ra) return { title: a, role: b, organization: a };
      if (mode === "role-first" && sep[0].trim() === ",") return { title: b, role: a, organization: b };
    }
  }
  if (hasRoleWord(t) && wordCount(t) <= 6) return { title: t, role: t };
  return { title: t };
}

function draftFrom(header: RoleOrg, extra: Partial<ActivityDraft>): ActivityDraft | null {
  const description = clean(extra.description) ?? "";
  const role = clean(header.role);
  const organization = clean(header.organization);
  let title = clean(organization ?? header.title ?? role);
  if (!title && description) title = firstClause(description);
  if (!title) return null;
  return {
    title,
    role: role && role !== title ? role : undefined,
    organization,
    category: clean(extra.category),
    description,
    grades: normalizeGrades(extra.grades),
    hoursPerWeek: extra.hoursPerWeek,
    weeksPerYear: extra.weeksPerYear,
  };
}

/* ------------------------------------------------------------------ */
/* Common App: labeled fields                                          */
/* ------------------------------------------------------------------ */

type LabelField = "category" | "role" | "organization" | "description" | "grades" | "timing" | "hours" | "weeks" | "intent";

const SEP = String.raw`\s*[:\-–—]?\s*`;
const SEP_REQUIRED = String.raw`\s*[:\-–—]\s*`;
/** A separator, or nothing more on the line (the value is on the next line). */
const SEP_OR_END = String.raw`(?:\s*[:\-–—]\s*|\s*$)`;

/** "Please describe this activity, including what you accomplished and any recognition you received, etc." */
const DESCRIBE_TAIL_WORDS = ["including", "what", "you", "accomplished", "and", "any", "recognition", "you", "received"];
const ETC = String.raw`(?:[\s,]*etc\.?)?`;
const DESCRIBE_LABEL = (() => {
  let nested = "";
  for (let i = DESCRIBE_TAIL_WORDS.length - 1; i >= 0; i--) nested = String.raw`(?:[\s,]+${DESCRIBE_TAIL_WORDS[i]}${nested})?`;
  return new RegExp(String.raw`^please\s+describe\s+this\s+activity${nested}${ETC}${SEP}`, "i");
})();
/** The rest of that label when a PDF wraps it onto the next line ("recognition you received, etc."). */
const DESCRIBE_TAIL = new RegExp(
  `^(?:${DESCRIBE_TAIL_WORDS.map((_, j) => DESCRIBE_TAIL_WORDS.slice(j).join(String.raw`[\s,]+`)).join("|")})${ETC}${SEP}|^etc\\.?${SEP}`,
  "i",
);

const LABELS: { field: LabelField; strong: boolean; re: RegExp }[] = [
  { field: "category", strong: true, re: new RegExp(String.raw`^activity\s*type\b${SEP}`, "i") },
  { field: "role", strong: true, re: new RegExp(String.raw`^position\s*(?:\/|and|&)?\s*leadership(?:\s+description)?\b${SEP}`, "i") },
  { field: "organization", strong: true, re: new RegExp(String.raw`^organi[sz]ation\s+name\b${SEP}`, "i") },
  { field: "organization", strong: false, re: new RegExp(String.raw`^organi[sz]ation${SEP_OR_END}`, "i") },
  { field: "description", strong: true, re: DESCRIBE_LABEL },
  { field: "description", strong: false, re: new RegExp(String.raw`^(?:activity\s+)?description${SEP_OR_END}`, "i") },
  { field: "grades", strong: true, re: new RegExp(String.raw`^participation\s+grade(?:\s+levels?)?\b${SEP}`, "i") },
  { field: "grades", strong: false, re: new RegExp(String.raw`^grade(?:\s+level)?s?${SEP_OR_END}`, "i") },
  { field: "timing", strong: true, re: new RegExp(String.raw`^timing\s+of(?:\s+participation)?\b${SEP}`, "i") },
  { field: "timing", strong: false, re: new RegExp(String.raw`^timing${SEP_OR_END}`, "i") },
  { field: "hours", strong: true, re: new RegExp(String.raw`^hours?\s+spent(?:\s+per(?:\s+week)?)?\b${SEP}`, "i") },
  { field: "hours", strong: false, re: new RegExp(String.raw`^(?:hours?\s+per\s+week|hrs?\s*\/\s*wk)\b${SEP}`, "i") },
  { field: "weeks", strong: true, re: new RegExp(String.raw`^weeks?\s+spent(?:\s+per(?:\s+year)?)?\b${SEP}`, "i") },
  { field: "weeks", strong: false, re: new RegExp(String.raw`^(?:weeks?\s+per\s+year|wks?\s*\/\s*yr)\b${SEP}`, "i") },
  { field: "intent", strong: true, re: /^i\s+intend\s+to\s+participate\b[^:]*:?\s*/i },
];

/** The second half of a label that wrapped in a PDF, by the field whose label it finishes. */
const LABEL_TAILS: Partial<Record<LabelField, RegExp>> = {
  role: new RegExp(String.raw`^description\b${SEP}`, "i"),
  organization: new RegExp(String.raw`^name\b${SEP}`, "i"),
  description: DESCRIBE_TAIL,
  grades: new RegExp(String.raw`^levels?\b${SEP}`, "i"),
  timing: new RegExp(String.raw`^(?:of\s+)?participation\b${SEP}`, "i"),
  hours: new RegExp(String.raw`^(?:per\s+)?week\b${SEP}`, "i"),
  weeks: new RegExp(String.raw`^(?:per\s+)?year\b${SEP}`, "i"),
};

/** Strong labels may also start mid-line when a PDF puts several fields on one line. */
const INLINE_LABEL_RE =
  /\s(?=(?:activity\s+type|position\s*(?:\/|and|&)?\s*leadership|organi[sz]ation\s+name|please\s+describe\s+this\s+activity|participation\s+grade\s+levels?|timing\s+of\s+participation|hours?\s+spent\s+per\s+week|weeks?\s+spent\s+per\s+year|i\s+intend\s+to\s+participate)\b)/gi;

/** "Activity 2" on its own line. (A bare number is not a heading: values like hours sit on their own lines.) */
const ACTIVITY_HEADING_RE = /^activity\s*#?\s*\d{1,2}\s*[:.)]?$/i;
const SECTION_TITLE_RE = /^(?:common\s+app\s+)?activities(?:\s+section)?(?:\s*\(\d+\))?\s*:?$/i;

/** True when the line is a Common App field label or an "Activity 2" heading. */
export function isLabelLine(text: string): boolean {
  return ACTIVITY_HEADING_RE.test(text) || LABELS.some((l) => l.re.test(text));
}

function matchLabel(text: string): { field: LabelField; strong: boolean; value: string } | null {
  for (const l of LABELS) {
    const m = l.re.exec(text);
    if (m) return { field: l.field, strong: l.strong, value: text.slice(m[0].length).trim() };
  }
  return null;
}

function splitAtLabels(text: string): string[] {
  if (text.length > MAX_LINE_FOR_PATTERNS) return [text];
  return text
    .split(INLINE_LABEL_RE)
    .map((s) => s.trim())
    .filter(Boolean);
}

function countStrongLabels(lines: Line[]): number {
  const seen = new Set<string>();
  for (const line of lines) {
    for (const seg of splitAtLabels(line.text)) {
      const lab = matchLabel(seg);
      if (lab?.strong) seen.add(lab.field);
    }
  }
  return seen.size;
}

type RawFields = Partial<Record<Exclude<LabelField, "intent">, string>>;

function hasContent(r: RawFields): boolean {
  return Boolean(r.role || r.organization || r.description || r.category);
}

function parseLabeled(lines: Line[]): { drafts: ActivityDraft[]; skipped: number } {
  const out: RawFields[] = [];
  let current: RawFields | null = null;
  let field: LabelField | null = null;
  /** Set right after a label with no value, while its wrapped second half may follow. */
  let pendingTail: LabelField | null = null;
  let skipped = 0;

  const flush = () => {
    if (current && hasContent(current)) out.push(current);
    current = null;
    field = null;
    pendingTail = null;
  };

  for (const line of lines) {
    if (!line.text) {
      field = null;
      pendingTail = null;
      continue;
    }
    for (const seg of splitAtLabels(line.text)) {
      if (ACTIVITY_HEADING_RE.test(seg)) {
        flush();
        current = {};
        continue;
      }
      if (SECTION_TITLE_RE.test(seg)) continue;
      let value = seg;
      const waiting: LabelField | null = pendingTail;
      if (waiting && current) {
        const tailRe: RegExp | undefined = LABEL_TAILS[waiting];
        const tail = tailRe ? tailRe.exec(seg) : null;
        pendingTail = null;
        if (tail) {
          value = seg.slice(tail[0].length).trim();
          if (!value) continue;
        }
      }
      const lab: ReturnType<typeof matchLabel> = value === seg ? matchLabel(seg) : null;
      if (lab) {
        const labelField: LabelField = lab.field;
        // An activity type, or a field that is already filled, starts the next activity.
        const open: RawFields | null = current;
        if (open && labelField === "category" && hasContent(open)) flush();
        else if (open && labelField !== "intent" && open[labelField] !== undefined) flush();
        const target: RawFields = current ?? {};
        current = target;
        field = labelField;
        if (labelField !== "intent" && lab.value) target[labelField] = lab.value;
        pendingTail = lab.value ? null : labelField;
        continue;
      }
      if (current && field) {
        if (field === "intent") continue; // "Yes" / "No"
        const prev = current[field];
        if (field === "hours" || field === "weeks") {
          if (!prev && /^\d/.test(value)) current[field] = value;
          continue;
        }
        current[field] = prev ? `${prev} ${value}` : value;
        continue;
      }
      skipped++;
    }
  }
  flush();

  const drafts: ActivityDraft[] = [];
  for (const r of out) {
    const role = clean(r.role);
    const organization = clean(r.organization);
    const description = clean(r.description) ?? "";
    if (!role && !organization && !description) continue;
    const draft = draftFrom(
      { title: organization ?? role ?? firstClause(description), role, organization },
      {
        category: r.category ? canonicalActivityType(r.category) ?? clean(r.category) : undefined,
        description,
        grades: r.grades,
        hoursPerWeek: parseHours(r.hours),
        weeksPerYear: parseWeeks(r.weeks),
      },
    );
    if (draft) drafts.push(draft);
  }
  return { drafts, skipped };
}

/* ------------------------------------------------------------------ */
/* Common App: numbered printed layout                                 */
/* ------------------------------------------------------------------ */

const NUMBERED_HEAD_RE = /^(?:activity\s*)?#?\s*(\d{1,2})\s*[.):\-–—]?\s+(.+)$/i;

function numberedHeader(text: string): { type: string; rest: string } | null {
  if (text.length > MAX_LINE_FOR_PATTERNS) return null;
  const m = NUMBERED_HEAD_RE.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > MAX_PARSED_ACTIVITIES) return null;
  return matchActivityTypePrefix(m[2]);
}

interface Meta {
  grades?: string;
  timing?: string;
  hours?: number;
  weeks?: number;
}

const HOURS_RE = /(?:hours?\s+(?:spent\s+)?per\s+week\s*[:\-–—]?\s*(\d{1,3}(?:\.\d+)?))|(?:(\d{1,3}(?:\.\d+)?)\s*(?:hrs?|hours?)\.?\s*(?:\/|per|a|each)\s*(?:wk|wks|week)\b\.?)/i;
const WEEKS_RE = /(?:weeks?\s+(?:spent\s+)?per\s+year\s*[:\-–—]?\s*(\d{1,2}))|(?:(\d{1,2})\s*(?:wks?|weeks?)\.?\s*(?:\/|per|a|each)\s*(?:yr|yrs|year)\b\.?)/i;
const GRADES_LABELED_RE = new RegExp(
  String.raw`(?:participation\s+)?grade(?:\s+levels?|s)?\s*[:\-–—]\s*((?:${GRADE_TOKEN}\b[\s,;&/]*(?:and\s+)?){1,6})`,
  "i",
);
const GRADES_RANGE_RE = /\(?\bgrades?\s+((?:9|10|11|12)(?:\s*(?:[-–—]|to|through)\s*(?:9|10|11|12))?(?:\s*,\s*(?:9|10|11|12)){0,3})\b\)?/i;
const TIMING_PHRASE = String.raw`(?:during\s+school\s+(?:year|break)|all\s+year|school\s+year|school\s+break)`;
const TIMING_RE = new RegExp(
  String.raw`(?:timing(?:\s+of\s+participation)?\s*[:\-–—]\s*)?(${TIMING_PHRASE}(?:\s*(?:,|and|&|\/)\s*(?:${TIMING_PHRASE}|break|school))*)`,
  "i",
);
const TIMING_LABELED_RE = /timing(?:\s+of\s+participation)?\s*[:\-–—]\s*((?:school|break|all\s+year|year)(?:\s*(?:,|and|&|\/)\s*(?:school|break|all\s+year|year))*)/i;
const INTENT_RE = /\bi\s+intend\s+to\s+participate\b/i;

/** Pulls grade levels, timing, and hours/weeks out of a line; returns what is left. */
function extractMeta(text: string): { meta: Meta; rest: string } {
  const meta: Meta = {};
  if (text.length > MAX_LINE_FOR_PATTERNS) return { meta, rest: text };
  let rest = text;
  const take = (re: RegExp, apply: (m: RegExpExecArray) => void) => {
    const m = re.exec(rest);
    if (m) {
      apply(m);
      rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`;
    }
  };
  take(HOURS_RE, (m) => (meta.hours = parseHours(m[1] ?? m[2])));
  take(WEEKS_RE, (m) => (meta.weeks = parseWeeks(m[1] ?? m[2])));
  take(GRADES_LABELED_RE, (m) => (meta.grades = m[1]));
  if (!meta.grades) take(GRADES_RANGE_RE, (m) => (meta.grades = m[1]));
  take(TIMING_LABELED_RE, (m) => (meta.timing = m[1]));
  if (!meta.timing) take(TIMING_RE, (m) => (meta.timing = m[1]));
  rest = rest.replace(/\s+/g, " ").trim();
  if (!meta.grades && GRADE_LIST_RE.test(rest)) {
    meta.grades = rest;
    rest = "";
  }
  rest = rest.replace(/^[\s,;|•·\-–—:]+|[\s,;|•·\-–—:]+$/g, "");
  return { meta, rest };
}

function isTitleCase(s: string): boolean {
  const words = s.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && w.length > 3);
  if (words.length === 0) return false;
  return words.filter((w) => /^[A-Z]/.test(w)).length / words.length >= 0.6;
}

function looksLikeSentence(s: string): boolean {
  return wordCount(s) >= 8 && (/[.!?]$/.test(s) || s.length >= 80);
}

function parseNumbered(lines: Line[]): { drafts: ActivityDraft[]; skipped: number } {
  // A bare number followed by a type on the next line reads as one header.
  const texts: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text;
    const next = lines[i + 1]?.text ?? "";
    if (/^#?\d{1,2}[.)]?$/.test(t) && matchActivityTypePrefix(next)) {
      texts.push(`${t.replace(/[.)]$/, "")}. ${next}`);
      i++;
    } else texts.push(t);
  }

  interface Block {
    type: string;
    headerRest: string;
    meta: Meta;
    content: string[];
  }
  const blocks: Block[] = [];
  let skipped = 0;
  let current: Block | null = null;
  let afterIntent = false;
  for (const t of texts) {
    if (!t) continue;
    const head = numberedHeader(t);
    if (head) {
      const { meta, rest } = extractMeta(head.rest);
      current = { type: head.type, headerRest: rest, meta, content: [] };
      blocks.push(current);
      afterIntent = false;
      continue;
    }
    if (!current) {
      if (!SECTION_TITLE_RE.test(t)) skipped++;
      continue;
    }
    if (INTENT_RE.test(t)) {
      afterIntent = true;
      continue;
    }
    if (afterIntent && /^(?:yes|no)\.?$/i.test(t)) continue;
    afterIntent = false;
    const { meta, rest } = extractMeta(t);
    if (meta.grades && !current.meta.grades) current.meta.grades = meta.grades;
    if (meta.timing && !current.meta.timing) current.meta.timing = meta.timing;
    if (meta.hours !== undefined && current.meta.hours === undefined) current.meta.hours = meta.hours;
    if (meta.weeks !== undefined && current.meta.weeks === undefined) current.meta.weeks = meta.weeks;
    const found = meta.grades || meta.timing || meta.hours !== undefined || meta.weeks !== undefined;
    if (found && !rest) continue;
    current.content.push(found ? rest : t);
  }

  const drafts: ActivityDraft[] = [];
  for (const b of blocks) {
    let header: RoleOrg | null = null;
    let descLines = [...b.content];
    if (/[a-z0-9]/i.test(b.headerRest)) {
      header = splitRoleOrg(b.headerRest, "role-first");
    } else if (descLines.length >= 2 || (descLines.length === 1 && !looksLikeSentence(descLines[0]) && descLines[0].length <= 155)) {
      const first = descLines[0];
      const second = descLines[1];
      if (
        descLines.length >= 3 &&
        !/[,|–—]/.test(first) &&
        first.length <= COMMON_APP_LIMITS.position &&
        second &&
        second.length <= COMMON_APP_LIMITS.organization &&
        !/[.!?]$/.test(second) &&
        isTitleCase(second)
      ) {
        header = { title: second, role: first, organization: second };
        descLines = descLines.slice(2);
      } else {
        header = splitRoleOrg(first, "role-first");
        descLines = descLines.slice(1);
      }
    }
    const description = clean(descLines.join(" ")) ?? "";
    const draft = draftFrom(header ?? { title: firstClause(description) }, {
      category: b.type,
      description,
      grades: b.meta.grades,
      hoursPerWeek: b.meta.hours,
      weeksPerYear: b.meta.weeks,
    });
    if (draft) drafts.push(draft);
  }
  return { drafts, skipped };
}

/* ------------------------------------------------------------------ */
/* Resumes                                                             */
/* ------------------------------------------------------------------ */

const BULLET_RE = /^\s*(?:[•●▪■□◦○‣⁃∙·◆◇➢➤►▸✓✔*]|[-–—](?=\s)|o(?=\s))\s*/;

const HEADING_VOCAB = new Set(
  (
    "activities activity extracurricular extracurriculars extra-curricular extra-curriculars leadership experience experiences work employment jobs " +
    "volunteer volunteering service services community research projects project independent athletics athletic sports arts art music performing " +
    "visual clubs club organizations organization involvement internships internship summer programs program education skills skill technical " +
    "honors honours honor awards award achievements coursework relevant courses test tests scores testing standardized contact information " +
    "references summary objective profile interests hobbies languages certifications publications presentations and other additional professional " +
    "academic selected school teaching tutoring outreach theater theatre dance writing entrepreneurship family responsibilities personal recognition " +
    "distinctions engagement civic employment"
  ).split(" "),
);
const SKIP_WORDS = new Set(
  (
    "education skills skill honors honours honor awards award achievements coursework courses test tests scores testing standardized contact " +
    "information references summary objective profile interests hobbies languages certifications publications presentations recognition distinctions"
  ).split(" "),
);
const INCLUDE_WORDS = new Set(
  (
    "activities activity extracurricular extracurriculars extra-curricular extra-curriculars leadership experience experiences work employment jobs " +
    "volunteer volunteering service services community research projects project athletics athletic sports arts art music clubs club organizations " +
    "involvement internships internship programs program teaching tutoring outreach theater theatre dance writing entrepreneurship family responsibilities engagement"
  ).split(" "),
);

type HeadingKind = "include" | "skip";

function headingKind(line: Line, index: number): HeadingKind | null {
  const t = line.text;
  if (!t || t.length > 50 || BULLET_RE.test(line.raw)) return null;
  const body = t.replace(/:$/, "").trim();
  if (!body || /[.,;!?]$/.test(body) || /\d/.test(body)) return null;
  const words = body
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[\s/]+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 6) return null;
  const known = words.every((w) => HEADING_VOCAB.has(w));
  const allCaps = /[A-Z]/.test(body) && !/[a-z]/.test(body);
  if (!known && !allCaps) return null;
  if (!known && index < 3) return "skip"; // a name or title at the top of the page
  const include = words.some((w) => INCLUDE_WORDS.has(w));
  const skip = words.some((w) => SKIP_WORDS.has(w));
  if (skip && !include) return "skip";
  return "include";
}

const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const SEASON = String.raw`(?:spring|summer|fall|autumn|winter)`;
const YEAR = String.raw`(?:19|20)\d{2}`;
const POINT = String.raw`(?:(?:${MONTH}|${SEASON})\s+)?${YEAR}`;
const TRAILING_DATE_RE = new RegExp(
  String.raw`[\s,|(–—-]*(?:${POINT}\s*(?:[-–—]|to|through)\s*(?:${POINT}|present|current|now|ongoing)|(?:${MONTH}|${SEASON})\s*(?:[-–—]|to)\s*(?:${MONTH}|${SEASON})\s+${YEAR}|${POINT})\s*\)?\s*$`,
  "i",
);
const TRAILING_GRADES_RE = /[\s,|(–—-]*\(?\s*(?:grades?\s+)?((?:9|10|11|12)(?:\s*(?:[-–—]|to|through|,|and)\s*(?:9|10|11|12)){1,3}|grade\s+(?:9|10|11|12))\s*\)?\s*$/i;
const TRAILING_LOCATION_RE = /,\s*[A-Z][A-Za-z.'\s-]{1,40},\s*[A-Z]{2}\s*$/;

interface HeaderInfo extends RoleOrg {
  grades?: string;
  hours?: number;
  weeks?: number;
}

/** Parses a resume entry header: drops trailing dates and locations, keeps grades and hours. */
function parseEntryHeader(line: Line): HeaderInfo {
  let main = line.text;
  let side = "";
  const gap = /\S(\s{3,})\S/.exec(line.raw);
  if (gap) {
    const cut = gap.index + 1;
    main = line.raw.slice(0, cut).replace(/\s+/g, " ").trim();
    side = line.raw.slice(cut).replace(/\s+/g, " ").trim();
  }
  const info: Partial<HeaderInfo> = {};
  for (const part of [side, main]) {
    if (!part) continue;
    const { meta } = extractMeta(part);
    info.grades ??= meta.grades;
    info.hours ??= meta.hours;
    info.weeks ??= meta.weeks;
  }
  if (main.length <= MAX_LINE_FOR_PATTERNS) {
    main = main.replace(HOURS_RE, " ").replace(WEEKS_RE, " ").replace(/\s+/g, " ").trim();
    for (let i = 0; i < 4; i++) {
      const before = main;
      const g = TRAILING_GRADES_RE.exec(main);
      if (g) {
        info.grades ??= g[1];
        main = main.slice(0, g.index);
      }
      main = main.replace(TRAILING_DATE_RE, "").replace(TRAILING_LOCATION_RE, "");
      main = main.replace(/[\s,;|–—:-]+$/, "").replace(/\(\s*$/, "").trim();
      if (main === before) break;
    }
  }
  const ro = splitRoleOrg(main || line.text, "auto");
  return { ...ro, grades: info.grades, hours: info.hours, weeks: info.weeks };
}

function hasDates(line: Line): boolean {
  return line.text.length <= MAX_LINE_FOR_PATTERNS && (TRAILING_DATE_RE.test(line.text) || /\s{3,}\S/.test(line.raw));
}

function isCompleteHeader(line: Line): boolean {
  if (hasDates(line)) return true;
  const ro = splitRoleOrg(line.text);
  return Boolean(ro.role && ro.organization);
}

interface Entry {
  headers: Line[];
  bullets: string[];
  desc: string[];
  standalone?: boolean;
}

function bulletGlyph(raw: string): string {
  const m = BULLET_RE.exec(raw);
  return m ? m[0].trim() : "";
}

function parseResumeSection(lines: Line[]): Entry[] {
  const bulletLines = lines.filter((l) => l.text && BULLET_RE.test(l.raw));
  const plainLines = lines.filter((l) => l.text && !BULLET_RE.test(l.raw));
  const glyphs = [...new Set(bulletLines.map((l) => bulletGlyph(l.raw)))];

  // Only bullets, at two levels: top-level bullets are entries, the others describe them.
  if (plainLines.length === 0 && glyphs.length >= 2) {
    const top = bulletGlyph(bulletLines[0].raw);
    const entries: Entry[] = [];
    for (const l of bulletLines) {
      const text = l.raw.replace(BULLET_RE, "").replace(/\s+/g, " ").trim();
      if (bulletGlyph(l.raw) === top) entries.push({ headers: [{ raw: text, text }], bullets: [], desc: [] });
      else if (entries.length > 0) entries[entries.length - 1].bullets.push(text);
    }
    return entries;
  }

  const entries: Entry[] = [];
  let current: Entry | null = null;
  let last: "header" | "bullet" | "desc" | null = null;
  for (const line of lines) {
    if (!line.text) {
      if (last === "bullet" || last === "desc") last = null;
      continue;
    }
    if (BULLET_RE.test(line.raw)) {
      const text = line.raw.replace(BULLET_RE, "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      if (!current || current.standalone) {
        current = { headers: [], bullets: [text], desc: [], standalone: true };
        entries.push(current);
      } else current.bullets.push(text);
      last = "bullet";
      continue;
    }
    const text = line.text;
    if (current && last === "bullet" && startsLowercase(text)) {
      current.bullets[current.bullets.length - 1] += ` ${text}`;
      continue;
    }
    if (current && last === "desc" && startsLowercase(text)) {
      current.desc[current.desc.length - 1] += ` ${text}`;
      continue;
    }
    if (current && !current.standalone && (last === "header" || last === "desc") && looksLikeSentence(text)) {
      current.desc.push(text);
      last = "desc";
      continue;
    }
    if (
      current &&
      !current.standalone &&
      last === "header" &&
      current.headers.length === 1 &&
      !isCompleteHeader(current.headers[0]) &&
      !isCompleteHeader(line)
    ) {
      current.headers.push(line);
      continue;
    }
    if (current && !current.standalone && last === "header" && current.headers.length === 1 && hasDates(line) && !hasRoleWord(text) && wordCount(text.replace(TRAILING_DATE_RE, "")) <= 3) {
      // A date or place line under the header.
      continue;
    }
    current = { headers: [line], bullets: [], desc: [] };
    entries.push(current);
    last = "header";
  }
  return entries;
}

function entryToDraft(entry: Entry): ActivityDraft | null {
  if (entry.standalone) {
    // A bullet with no header: the bullet is the whole activity.
    const text = entry.bullets.join(" ");
    const colon = /^(.{2,80}?):\s+(.+)$/.exec(text);
    if (colon) {
      const h = parseEntryHeader({ raw: colon[1], text: colon[1] });
      return draftFrom(h, { description: colon[2], grades: h.grades, hoursPerWeek: h.hours, weeksPerYear: h.weeks });
    }
    const h = parseEntryHeader({ raw: text, text });
    if (text.length <= 100) return draftFrom(h, { description: "", grades: h.grades, hoursPerWeek: h.hours, weeksPerYear: h.weeks });
    return draftFrom({ title: firstClause(text) }, { description: text });
  }
  const [h1, h2] = entry.headers;
  let info = parseEntryHeader(h1);
  const descParts: string[] = [];
  if (h2) {
    const second = parseEntryHeader(h2);
    const secondText = second.title;
    if (secondText && !/[.!?]$/.test(secondText) && secondText.length < 90) {
      if (!info.role && !info.organization) {
        if (hasRoleWord(h1.text) && !hasRoleWord(secondText)) info = { ...info, title: secondText, role: info.title, organization: secondText };
        else if (hasRoleWord(secondText)) info = { ...info, role: second.role ?? secondText, organization: info.title };
        else descParts.push(h2.text);
      } else if (!info.organization && second.title) {
        info = { ...info, organization: second.title, title: second.title };
      } else descParts.push(h2.text);
    } else descParts.push(h2.text);
    info.grades ??= second.grades;
    info.hours ??= second.hours;
    info.weeks ??= second.weeks;
  }
  descParts.push(...entry.desc, ...entry.bullets);
  return draftFrom(info, {
    description: joinParts(descParts),
    grades: info.grades,
    hoursPerWeek: info.hours,
    weeksPerYear: info.weeks,
  });
}

function parseResume(lines: Line[]): { drafts: ActivityDraft[]; skipped: number; sections: number } {
  const kinds = lines.map((l, i) => headingKind(l, i));
  const headingCount = kinds.filter(Boolean).length;
  const sections: Line[][] = [];
  let skipped = 0;
  if (headingCount === 0) {
    sections.push(lines);
  } else {
    let mode: HeadingKind | "preamble" = "preamble";
    let buf: Line[] = [];
    for (let i = 0; i < lines.length; i++) {
      const kind = kinds[i];
      if (kind) {
        if (mode === "include" && buf.length) sections.push(buf);
        buf = [];
        mode = kind;
        continue;
      }
      if (mode === "include") buf.push(lines[i]);
      else if (lines[i].text) skipped++;
    }
    if (mode === "include" && buf.length) sections.push(buf);
  }
  const drafts: ActivityDraft[] = [];
  for (const section of sections) {
    for (const entry of parseResumeSection(section)) {
      const d = entryToDraft(entry);
      if (d) drafts.push(d);
    }
  }
  return { drafts, skipped, sections: headingCount };
}

/* ------------------------------------------------------------------ */
/* Plain lists                                                         */
/* ------------------------------------------------------------------ */

const NUMBERED_ITEM_RE = /^\(?\d{1,2}[.)]\s+/;

function parseList(lines: Line[]): ActivityDraft[] {
  const blocks: string[][] = [];
  let buf: string[] = [];
  for (const l of lines) {
    if (!l.text) {
      if (buf.length) blocks.push(buf);
      buf = [];
    } else buf.push(l.text);
  }
  if (buf.length) blocks.push(buf);

  let items: string[][] = blocks;
  if (blocks.length === 1 && blocks[0].length > 1) {
    const only = blocks[0];
    if (only.filter((t) => NUMBERED_ITEM_RE.test(t)).length >= 2) {
      items = [];
      for (const t of only) {
        if (NUMBERED_ITEM_RE.test(t) || items.length === 0) items.push([t]);
        else items[items.length - 1].push(t);
      }
    } else items = only.map((t) => [t]);
  }

  const drafts: ActivityDraft[] = [];
  for (const item of items) {
    const [first, ...rest] = item.map((t) => t.replace(NUMBERED_ITEM_RE, "").trim());
    if (!first) continue;
    if (rest.length > 0) {
      const h = parseEntryHeader({ raw: first, text: first });
      const d = draftFrom(h, { description: rest.join(" "), grades: h.grades, hoursPerWeek: h.hours, weeksPerYear: h.weeks });
      if (d) drafts.push(d);
      continue;
    }
    const colon = /^(.{2,80}?):\s+(.{3,})$/.exec(first);
    const dash = /^(.{2,80}?)\s[-–—]\s(.{30,})$/.exec(first);
    const split = colon ?? dash;
    if (split) {
      const h = parseEntryHeader({ raw: split[1], text: split[1] });
      const d = draftFrom(h, { description: split[2], grades: h.grades, hoursPerWeek: h.hours, weeksPerYear: h.weeks });
      if (d) drafts.push(d);
    } else if (first.length <= 100) {
      const h = parseEntryHeader({ raw: first, text: first });
      const d = draftFrom(h, { description: "", grades: h.grades, hoursPerWeek: h.hours, weeksPerYear: h.weeks });
      if (d) drafts.push(d);
    } else {
      const d = draftFrom({ title: firstClause(first) }, { description: first });
      if (d) drafts.push(d);
    }
  }
  return drafts;
}

/* ------------------------------------------------------------------ */
/* Ids, de-duplication, entry point                                    */
/* ------------------------------------------------------------------ */

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function slug(input: string, max = 24): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "activity"
  );
}

/** A stable id for a parsed activity, so re-importing the same list keeps the same ids. */
export function activityIdFor(draft: Pick<ActivityDraft, "title" | "role" | "organization" | "description">): string {
  return `act-${slug(draft.title)}-${fnv1a([draft.title, draft.role ?? "", draft.organization ?? "", draft.description].join("\n"))}`;
}

function sameActivityKey(d: ActivityDraft): string {
  return [d.title, d.role ?? "", d.organization ?? "", d.description].map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()).join("|");
}

/** Assigns ids, removes exact duplicates, and caps the list. */
export function finalizeDrafts(drafts: ActivityDraft[]): { activities: Activity[]; dropped: number } {
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const activities: Activity[] = [];
  let dropped = 0;
  for (const d of drafts) {
    const key = sameActivityKey(d);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    if (activities.length >= MAX_PARSED_ACTIVITIES) {
      dropped++;
      continue;
    }
    let id = activityIdFor(d);
    for (let n = 2; seenIds.has(id); n++) id = `${activityIdFor(d)}-${n}`;
    seenIds.add(id);
    const a: Activity = { id, title: d.title, description: d.description };
    if (d.role) a.role = d.role;
    if (d.organization) a.organization = d.organization;
    if (d.category) a.category = d.category;
    if (d.grades) a.grades = d.grades;
    if (d.hoursPerWeek !== undefined) a.hoursPerWeek = d.hoursPerWeek;
    if (d.weeksPerYear !== undefined) a.weeksPerYear = d.weeksPerYear;
    activities.push(a);
  }
  return { activities, dropped };
}

/** Detects the layout of the text. */
export function detectFormat(text: string): ActivitySourceFormat {
  const lines = prepareLines(text);
  if (countStrongLabels(lines) >= 2) return "commonapp";
  const headers = lines.filter((l) => numberedHeader(l.text)).length;
  if (headers >= 2 || (headers === 1 && lines.some((l) => HOURS_RE.test(l.text) || GRADES_LABELED_RE.test(l.text)))) return "commonapp-numbered";
  const headings = lines.filter((l, i) => headingKind(l, i)).length;
  const bullets = lines.filter((l) => l.text && BULLET_RE.test(l.raw)).length;
  if (headings > 0 || bullets >= 2) return "resume";
  return "list";
}

export function parseActivitiesDeterministic(text: string): DeterministicParse {
  const lines = prepareLines(text);
  const format = detectFormat(text);
  let drafts: ActivityDraft[];
  let skipped = 0;
  if (format === "commonapp") ({ drafts, skipped } = parseLabeled(lines));
  else if (format === "commonapp-numbered") ({ drafts, skipped } = parseNumbered(lines));
  else if (format === "resume") ({ drafts, skipped } = parseResume(lines));
  else drafts = parseList(lines);

  const { activities, dropped } = finalizeDrafts(drafts);
  const warnings: string[] = [];
  if (activities.length === 0) {
    warnings.push("No activities were found in this text. Paste your Common App activities or the activity sections of your resume.");
  }
  if (dropped > 0) warnings.push(`Only the first ${MAX_PARSED_ACTIVITIES} activities were kept.`);
  const missing = activities.filter((a) => !a.description).length;
  if (activities.length > 0 && missing > 0) {
    warnings.push(missing === 1 ? "One activity has no description yet." : `${missing} activities have no description yet.`);
  }
  if (format === "resume" && skipped > 0) {
    warnings.push("Sections that are not activities (education, skills, honors, contact details) were skipped.");
  }
  const commonApp = format === "commonapp" || format === "commonapp-numbered";
  const confident = commonApp && activities.length > 0 && missing === 0;
  return { activities, format, confident, warnings };
}
