/**
 * Seed corpora bundled with the app (/data/corpus/<school>.json). These are the
 * verified research bases built for the current term; the database copy
 * (corpus_facts) is what the app reads and refreshes at runtime.
 */
import cornell from "@data/corpus/cornell.json";
import dartmouth from "@data/corpus/dartmouth.json";
import penn from "@data/corpus/penn.json";
import tufts from "@data/corpus/tufts.json";
import umich from "@data/corpus/umich.json";
import type { CorpusFile } from "@/lib/types";

const SEEDS: CorpusFile[] = [dartmouth, penn, cornell, tufts, umich] as unknown as CorpusFile[];

export function seedCorpora(): CorpusFile[] {
  return SEEDS;
}

export function seedCorpus(schoolId: string): CorpusFile | undefined {
  return SEEDS.find((c) => c.schoolId === schoolId);
}
