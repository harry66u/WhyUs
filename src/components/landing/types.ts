/**
 * Data the landing page renders. Built on the server at build time
 * (demo-data.ts) and passed to client components as plain JSON, so nothing
 * here may hold functions, Dates, Maps, or class instances.
 */
import type { Dossier, FactKind, ResearchEvent, SwapResult } from "@/lib/types";

/**
 * "corpus": built from the verified research bases in /data/corpus.
 * "example": the fictional example.edu fixture, shown (and labeled "Example")
 * only when no verified research base can produce a dossier.
 */
export type DemoSource = "corpus" | "example";

/** One verified detail shown as a citation specimen. */
export interface LandingCitation {
  factId: string;
  kind: FactKind;
  title: string;
  /** Verbatim text that verification found on the source page. */
  quote: string;
  sourceUrl: string;
  /** YYYY-MM-DD of the last confirmation on the live page. */
  verifiedAt: string;
  /** The name verification also looks for on the page (e.g. a course code); null when unknown. */
  nameOnPage: string | null;
  /** The official domain or host the source URL belongs to (e.g. "cornell.edu"). */
  officialDomain: string | null;
}

/** Another school on the sample student's list, in swap-test order. */
export interface ComparedSchool {
  schoolId: string;
  name: string;
  shortName: string;
  /** False when the school has no verified research base (its swap results read "not researched yet"). */
  researched: boolean;
}

/** Size of the verified research bases the demo draws on. */
export interface CorpusStats {
  /** School short names with at least one verified fact, alphabetical. */
  schools: string[];
  facts: number;
  pages: number;
  /** Term label, e.g. "fall 2026". */
  term: string | null;
}

export interface LandingDemo {
  source: DemoSource;
  school: { id: string; name: string; shortName: string };
  unit: { name: string; shortName: string | null } | null;
  prompt: {
    text: string;
    wordLimit: number | null;
    sourceUrl: string | null;
    /** YYYY-MM-DD the prompt text was confirmed on its official page; null for the example. */
    verifiedAt: string | null;
  };
  /** The sample student, reduced to what the page says about them. */
  student: { activityCount: number; intendedMajors: string[] };
  /** Research events in the order a real run emits them (replayed by the demo). */
  events: ResearchEvent[];
  /** YYYY-MM-DD verification date of every fact the replay confirms, by fact id. */
  verifiedOn: Record<string, string>;
  /** The dossier those events assemble. */
  dossier: Dossier;
  /** Display values for the dossier score, worded by the briefing's own model (components/dossier/model). */
  summary: DossierSummary;
  compared: ComparedSchool[];
  /**
   * A fact verified in the same run that is not in the dossier and that most
   * of the other schools on the list have something comparable to (by the
   * engine's swap test). Shown beside the dossier's details to make the test visible.
   */
  leftOut: LeftOutDetail | null;
  citation: LandingCitation;
  corpusStats: CorpusStats | null;
}

/**
 * What the client-side replay needs, and nothing else (it is serialized into
 * the page). Built from a LandingDemo by toDemoView (demo-view.ts).
 */
export interface DemoView {
  source: DemoSource;
  school: LandingDemo["school"];
  unit: LandingDemo["unit"];
  prompt: { text: string; wordLimit: number | null };
  events: ResearchEvent[];
  verifiedOn: Record<string, string>;
  compared: ComparedSchool[];
  summary: DossierSummary;
  /** The dossier's details in rank order, reduced to what the forming dossier shows. */
  details: DemoDetailView[];
  /** The final lead angle (reserves its space while the replay runs). */
  leadAngle: string | null;
}

export interface DemoDetailView {
  factId: string;
  rank: number;
  kind: FactKind;
  title: string;
  sourceUrl: string;
  /** 0-100, rounded. */
  score: number;
  /** "Commonly mentioned" whenever the engine flags it, else the engine's label. */
  label: string;
  commonlyMentioned: boolean;
  swap: Pick<SwapResult, "schoolId" | "schoolName" | "status">[];
}

export interface LeftOutDetail {
  factId: string;
  kind: FactKind;
  title: string;
  swap: SwapResult[];
}

export interface DossierSummary {
  /** 0-100, rounded. */
  score: number;
  /** Band of the score scale, e.g. "Distinctive". */
  bandLabel: string;
  bandTone: "accent" | "mid" | "neutral";
  /** e.g. "8 details: 4 distinctive, 3 uncommon, 1 typical" */
  countsText: string | null;
}
