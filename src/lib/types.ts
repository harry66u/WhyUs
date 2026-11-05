/**
 * Shared domain contracts for WhyUs.
 *
 * Every module (research engine, matching engine, UI, PDF export, draft checker)
 * builds against these types. Change them deliberately: they are also the shape
 * of the seed corpus JSON files in /data and of persisted JSON columns.
 */

/* ------------------------------------------------------------------ */
/* Schools, units, prompts                                             */
/* ------------------------------------------------------------------ */

export type SchoolId = string; // e.g. "dartmouth", "penn", "cornell", "tufts", "umich"

/** A degree-granting undergraduate unit inside a school (e.g. Cornell CALS). */
export interface SchoolUnit {
  id: string; // stable within the school, e.g. "cals", "seas", "lsa", "college"
  name: string; // official name, e.g. "College of Agriculture and Life Sciences"
  shortName?: string; // e.g. "CALS"
  aliases: string[]; // names a prompt might use to refer to this unit
  /** Hosts that primarily belong to this unit (used to scope research). */
  hosts: string[];
}

export type PromptKind = "why_school" | "why_major" | "community" | "other";

export interface SupplementalPrompt {
  id: string; // e.g. "umich-2026-why-unit"
  schoolId: SchoolId;
  /** Units this prompt applies to; empty = every applicant to the school. */
  unitIds: string[];
  cycle: string; // e.g. "2026-27"
  kind: PromptKind;
  title: string; // short label for pickers, e.g. "Why Michigan (your school or college)"
  text: string; // exact prompt text
  wordLimit: { min?: number; max: number } | null;
  sourceUrl: string | null;
  /** ISO date the prompt text was confirmed on sourceUrl; null if not confirmable. */
  verifiedAt: string | null;
  note?: string;
}

export type SeedCategory =
  | "catalog"
  | "departments"
  | "faculty"
  | "research"
  | "organizations"
  | "programs"
  | "traditions"
  | "location"
  | "admissions"
  | "overview";

export interface SeedUrl {
  url: string;
  category: SeedCategory;
  unitIds?: string[];
  note?: string;
}

export interface School {
  id: SchoolId;
  name: string; // "Dartmouth College"
  shortName: string; // "Dartmouth"
  city: string;
  state: string;
  setting?: "urban" | "suburban" | "rural" | "town";
  /** Registrable domains that count as official, e.g. ["dartmouth.edu"]. Subdomains included. */
  officialDomains: string[];
  /**
   * Hosts on third-party domains that the school operates officially
   * (hosted catalogs, the official student-organization platform).
   */
  officialHosts: string[];
  units: SchoolUnit[];
  prompts: SupplementalPrompt[];
  seedUrls: SeedUrl[];
  /** Hosts that were unreachable for automated verification when last researched. */
  unreachableHosts?: { host: string; reason: string; checkedAt: string }[];
  /** True when /data/corpus/<id>.json exists with verified facts. */
  hasCorpus?: boolean;
}

/* ------------------------------------------------------------------ */
/* Research corpus                                                     */
/* ------------------------------------------------------------------ */

/**
 * Categories of official-source details. Mirrors the research requirements:
 * catalog courses, department/faculty pages, labs and centers, student
 * organizations, special programs, traditions, and location-based opportunities.
 */
export type FactKind =
  | "course"
  | "major" // degree, major, minor, concentration, track
  | "faculty"
  | "lab"
  | "center"
  | "facility" // shop, studio, field station, collection
  | "organization" // student organization, team, ensemble
  | "program" // special program: fellowship, research program, residential program, off-campus program
  | "tradition"
  | "location"; // opportunity tied to the place (city, region, landscape, partners)

export const FACT_KINDS: FactKind[] = [
  "course",
  "major",
  "faculty",
  "lab",
  "center",
  "facility",
  "organization",
  "program",
  "tradition",
  "location",
];

/** How often applicants tend to cite a detail. "common" = label as commonly mentioned. */
export type Commonness = "common" | "moderate" | "rare";

export type VerificationStatus = "verified" | "failed" | "unreachable";

export interface VerificationResult {
  status: VerificationStatus;
  checkedAt: string; // ISO timestamp
  /** Why it failed or could not be checked (HTTP status, bot challenge, quote not found...). */
  detail?: string;
  /** Final URL after redirects, when it differs from sourceUrl. */
  finalUrl?: string;
}

/** One verified, citable detail about a school, taken from an official page. */
export interface Fact {
  id: string; // stable id, e.g. "dartmouth:engs-37:3fa9c1"
  schoolId: SchoolId;
  /** Units this fact belongs to; empty = university-wide (open to all undergraduates). */
  unitIds: string[];
  kind: FactKind;
  /** Display title, e.g. "ENGS 37: Introduction to Environmental Engineering". */
  title: string;
  /** A string that must appear on the source page (often the official name or course code). */
  nameOnPage: string;
  /** One plain sentence describing the detail. Must be supported by `quote`. */
  summary: string;
  /**
   * Verb phrase describing what a student does or gets, supported by `quote`,
   * e.g. "has students design and test environmental measurement systems".
   */
  hook: string;
  /** Verbatim excerpt from the source page. This is what verification checks. */
  quote: string;
  sourceUrl: string; // official https URL
  sourceTitle: string; // <title> of the page
  /** Theme keys from src/lib/matching/themes.ts. */
  themes: string[];
  commonness: Commonness;
  commonnessReason?: string;
  people?: string[];
  /** Term the corpus entry was researched for, e.g. "2026-fall". */
  term: string;
  /** ISO date (YYYY-MM-DD) of the last successful confirmation on the live page. */
  verifiedAt: string | null;
  verification?: VerificationResult;
}

export interface CorpusFile {
  schoolId: SchoolId;
  term: string;
  builtAt: string;
  builtBy: string; // "research-agent" | "crawler:<model>" | ...
  facts: Fact[];
}

/* ------------------------------------------------------------------ */
/* Students                                                            */
/* ------------------------------------------------------------------ */

export interface Activity {
  id: string;
  title: string; // "Creek Watch Sensor Network"
  role?: string; // "Founder & Lead Engineer"
  organization?: string;
  category?: string; // Common App activity type, e.g. "Environmental"
  description: string;
  grades?: string; // "10, 11, 12"
  hoursPerWeek?: number;
  weeksPerYear?: number;
}

export interface StudentProfile {
  id: string;
  name: string;
  graduationYear: number;
  highSchool?: string;
  location?: string;
  intendedMajors: string[];
  interests: string[];
  activities: Activity[];
}

/* ------------------------------------------------------------------ */
/* Applications and research runs                                      */
/* ------------------------------------------------------------------ */

export type ApplicationStatus = "queued" | "researching" | "ready" | "failed";

export interface ApplicationInput {
  studentId: string;
  schoolId: SchoolId;
  unitId: string | null;
  promptId: string | null; // null when the student pasted a custom prompt
  promptText: string;
  wordLimit: number | null;
}

export type ResearchStage = "scope" | "discover" | "read" | "verify" | "match" | "swap" | "assemble";

export const RESEARCH_STAGES: { stage: ResearchStage; label: string }[] = [
  { stage: "scope", label: "Scope the prompt" },
  { stage: "discover", label: "Find official pages" },
  { stage: "read", label: "Read pages" },
  { stage: "verify", label: "Verify facts" },
  { stage: "match", label: "Match to profile" },
  { stage: "swap", label: "Run swap test" },
  { stage: "assemble", label: "Assemble dossier" },
];

export type PageStatus = "reading" | "read" | "cached" | "blocked" | "failed";

export type ResearchEvent =
  | { type: "stage"; stage: ResearchStage; status: "start" | "done"; detail?: string }
  | { type: "page"; url: string; title?: string; status: PageStatus; ms?: number; reason?: string }
  | {
      type: "fact";
      factId: string;
      title: string;
      kind: FactKind;
      url: string;
      status: "verified" | "rejected";
      quote?: string;
      reason?: string;
    }
  | { type: "match"; factId: string; title: string; activityTitle?: string; score: number; sentence: string }
  | {
      type: "swap";
      factId: string;
      title: string;
      results: { schoolId: SchoolId; schoolName: string; status: SwapStatus; equivalentTitle?: string }[];
    }
  | { type: "angle"; line: string; isLead: boolean }
  | { type: "log"; message: string }
  | { type: "done"; dossierId: string; uniquenessScore: number }
  | { type: "error"; message: string };

/** A persisted research event, as streamed to the live research view. */
export interface StoredResearchEvent {
  seq: number;
  runId: string;
  ts: string; // ISO timestamp
  event: ResearchEvent;
}

/* ------------------------------------------------------------------ */
/* Dossiers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Swap test outcome for one other school on the student's list:
 * - equivalent: that school's verified research has essentially the same thing
 * - similar: something comparable but clearly different
 * - none: that school's verified research has nothing comparable
 * - unknown: no verified research base for that school yet (never claim "none")
 */
export type SwapStatus = "equivalent" | "similar" | "none" | "unknown";

export interface SwapResult {
  schoolId: SchoolId;
  schoolName: string;
  status: SwapStatus;
  equivalentTitle?: string;
  equivalentUrl?: string;
}

export type UniquenessLabel = "Distinctive" | "Uncommon" | "Typical" | "Commonly mentioned";

export interface DossierDetail {
  factId: string;
  rank: number; // 1-based
  kind: FactKind;
  title: string;
  summary: string;
  quote: string;
  sourceUrl: string;
  sourceTitle: string;
  /** ISO date (YYYY-MM-DD) the fact was confirmed on the live page. */
  verifiedAt: string;
  fit: {
    sentence: string; // one plain sentence explaining the connection
    activityIds: string[];
    themes: string[];
    score: number; // 0-1
  };
  uniqueness: {
    score: number; // 0-100
    label: UniquenessLabel;
    commonlyMentioned: boolean;
    reason: string;
  };
  swap: SwapResult[];
}

export interface EssayAngle {
  key: string; // stable angle key used to avoid repeats across a student's schools
  line: string; // one line, idea only, never drafted prose
  factIds: string[];
  activityIds: string[];
  themes: string[];
  isLead: boolean;
}

export interface DossierQuestion {
  text: string;
  factId?: string;
  audience: "info_session" | "current_student";
}

export interface Dossier {
  id: string;
  applicationId: string;
  studentId: string;
  schoolId: SchoolId;
  schoolName: string;
  unitId: string | null;
  unitName: string | null;
  prompt: { text: string; wordLimit: number | null };
  generatedAt: string; // ISO timestamp
  term: string;
  uniquenessScore: number; // 0-100
  details: DossierDetail[]; // 6-8
  angles: EssayAngle[]; // 2-3
  questions: DossierQuestion[]; // exactly 3
  policyNote: string;
  stats: {
    pagesRead: number;
    pagesBlocked: number;
    factsConsidered: number;
    factsVerified: number;
    factsRejected: number;
    durationMs: number;
    engine: "llm" | "deterministic";
  };
}

export const RESEARCH_POLICY_NOTE =
  "WhyUs is a research tool. It gathers verified details from official school sources and suggests angles to explore; it does not write, draft, or edit essays. Colleges expect the essay itself to be your own work, and many publish policies on AI use in applications. Use this briefing the way you would use notes from a campus visit.";

/* ------------------------------------------------------------------ */
/* Draft checker                                                       */
/* ------------------------------------------------------------------ */

export type DraftIssueType =
  | "word_count"
  | "unverified_claim"
  | "verified_claim"
  | "swappable"
  | "generic"
  | "wrong_school";

export interface DraftIssue {
  type: DraftIssueType;
  severity: "info" | "warning" | "problem";
  message: string;
  /** Character range in the draft text this issue refers to. */
  range?: { start: number; end: number };
  excerpt?: string;
  sourceUrl?: string;
  verifiedAt?: string;
  otherSchools?: { schoolId: SchoolId; schoolName: string; equivalentTitle?: string }[];
}

export interface DraftCheckResult {
  wordCount: number;
  wordLimit: number | null;
  withinLimit: boolean | null;
  issues: DraftIssue[];
  summary: {
    verifiedClaims: number;
    unverifiedClaims: number;
    genericSentences: number;
    swappableSentences: number;
    sentences: number;
  };
  checkedAt: string;
}

/* ------------------------------------------------------------------ */
/* Accounts and billing                                                */
/* ------------------------------------------------------------------ */

export type AccountRole = "student" | "parent" | "counselor";

export type PurchaseKind = "school_credit" | "unlimited" | "counselor";

export interface Entitlements {
  /** Schools the account may still add right now (Infinity when unlimited). */
  remainingSchools: number;
  freeSchoolAvailable: boolean;
  credits: number;
  unlimitedStudentIds: string[];
  counselorPlan: { active: boolean; maxStudents: number };
}
