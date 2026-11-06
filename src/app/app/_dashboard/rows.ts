/** Dashboard row shape, shared by the server summary and the client list. */
import type { ApplicationStatus } from "@/lib/types";

export interface DashboardRow {
  id: string;
  schoolId: string;
  schoolName: string;
  unitName: string | null;
  /** Library prompt title, or the start of a pasted prompt. */
  promptTitle: string;
  promptIsCustom: boolean;
  wordLimit: number | null;
  status: ApplicationStatus;
  progress: number;
  error: string | null;
  uniquenessScore: number | null;
  leadAngle: string | null;
  updatedAt: string;
  /** Where the row leads: the dossier when ready, the live research view otherwise. */
  href: string;
  /** The profile was edited after this dossier was built. */
  profileChangedSinceResearch: boolean;
}

export function isActiveStatus(status: ApplicationStatus): boolean {
  return status === "queued" || status === "researching";
}
