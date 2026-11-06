import type { FactKind, SwapResult, UniquenessLabel } from "@/lib/types";
import type { RunMeta } from "./state";

/** The finished dossier, trimmed to what the live view shows once research settles. */
export interface FinalDossierView {
  dossierId: string;
  uniquenessScore: number;
  generatedAt: string;
  details: {
    factId: string;
    rank: number;
    kind: FactKind;
    title: string;
    sentence: string;
    uniqueness: { score: number; label: UniquenessLabel; commonlyMentioned: boolean };
    swap: SwapResult[];
    sourceUrl: string;
    verifiedAt: string;
  }[];
  angles: { line: string; isLead: boolean }[];
}

export interface ResearchViewProps {
  applicationId: string;
  schoolName: string;
  schoolShortName: string;
  unitName: string | null;
  prompt: { text: string; wordLimit: number | null };
  initialRun: RunMeta | null;
  final: FinalDossierView | null;
  dossierHref: string;
}
