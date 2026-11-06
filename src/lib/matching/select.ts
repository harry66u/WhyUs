/**
 * Choosing the 6-8 details of a dossier from scored, verified facts.
 *
 * Greedy diversification over the ranking:
 * - at most 3 details of one kind (relaxed only if fewer than 6 could be chosen);
 * - a detail that serves the same activity and theme as one already chosen is
 *   discounted, as are repeats of the same activity, source page, or person;
 * - at least one course and one non-academic detail (organization, tradition,
 *   place) when a strong one exists;
 * - stop at 6 once the remaining candidates are weak.
 */
import type { FactKind } from "@/lib/types";
import { NON_ACADEMIC_KINDS } from "./features";
import type { ScoredFact } from "./rank";

export interface SelectOptions {
  min?: number;
  max?: number;
  maxPerKind?: number;
  /** Value used to rank candidates (defaults to the ranking score). */
  value?: (s: ScoredFact) => number;
}

function pairKey(s: ScoredFact): string | null {
  const link = s.links[0];
  if (!link || !link.themes[0]) return null;
  return `${link.source.id}|${link.themes[0].key}`;
}

interface State {
  chosen: ScoredFact[];
  kinds: Map<FactKind, number>;
  pairs: Set<string>;
  activities: Map<string, number>;
  sources: Set<string>;
  people: Set<string>;
}

function emptyState(): State {
  return { chosen: [], kinds: new Map(), pairs: new Set(), activities: new Map(), sources: new Set(), people: new Set() };
}

function add(state: State, s: ScoredFact) {
  state.chosen.push(s);
  state.kinds.set(s.fact.kind, (state.kinds.get(s.fact.kind) ?? 0) + 1);
  const pk = pairKey(s);
  if (pk) state.pairs.add(pk);
  const act = s.links[0]?.source.id;
  if (act) state.activities.set(act, (state.activities.get(act) ?? 0) + 1);
  state.sources.add(s.fact.sourceUrl);
  for (const p of s.fact.people ?? []) state.people.add(p.toLowerCase());
}

function adjusted(state: State, s: ScoredFact, value: (s: ScoredFact) => number): number {
  let v = value(s);
  const pk = pairKey(s);
  if (pk && state.pairs.has(pk)) v *= 0.55;
  const act = s.links[0]?.source.id;
  if (act) v *= Math.pow(0.86, state.activities.get(act) ?? 0);
  if (state.sources.has(s.fact.sourceUrl)) v *= 0.8;
  if ((s.fact.people ?? []).some((p) => state.people.has(p.toLowerCase()))) v *= 0.85;
  return v;
}

function weakAfterMin(v: number, top: number): boolean {
  return v < 0.12 || v < 0.32 * top;
}

export function selectDetails(ranked: ScoredFact[], opts: SelectOptions = {}): ScoredFact[] {
  const min = opts.min ?? 6;
  const max = opts.max ?? 8;
  const perKind = opts.maxPerKind ?? 3;
  const value = opts.value ?? ((s: ScoredFact) => s.score);
  const pool = [...ranked].sort((a, b) => value(b) - value(a) || a.fact.id.localeCompare(b.fact.id));
  const top = pool[0] ? value(pool[0]) : 0;
  const state = emptyState();

  const pick = (capKinds: boolean): ScoredFact | null => {
    let best: ScoredFact | null = null;
    let bestV = -1;
    for (const s of pool) {
      if (state.chosen.includes(s)) continue;
      if (capKinds && (state.kinds.get(s.fact.kind) ?? 0) >= perKind) continue;
      const v = adjusted(state, s, value);
      if (v > bestV + 1e-12) {
        best = s;
        bestV = v;
      }
    }
    return best;
  };

  while (state.chosen.length < max) {
    const next = pick(true) ?? (state.chosen.length < min ? pick(false) : null);
    if (!next) break;
    if (state.chosen.length >= min && weakAfterMin(value(next), top)) break;
    add(state, next);
  }

  ensure(state, pool, (s) => s.fact.kind === "course", max, perKind, value);
  ensure(state, pool, (s) => NON_ACADEMIC_KINDS.has(s.fact.kind), max, perKind, value);

  return state.chosen.sort((a, b) => value(b) - value(a) || a.fact.id.localeCompare(b.fact.id));
}

/**
 * Make sure one detail satisfies `want` when a strong candidate exists:
 * add it if there is room, otherwise replace the weakest detail that is not
 * the only course or the only non-academic detail.
 */
function ensure(state: State, pool: ScoredFact[], want: (s: ScoredFact) => boolean, max: number, perKind: number, value: (s: ScoredFact) => number) {
  if (state.chosen.length === 0 || state.chosen.some(want)) return;
  const scores = state.chosen.map(value).sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)];
  const candidate = pool.find(
    (s) => !state.chosen.includes(s) && want(s) && s.fit >= 0.3 && value(s) >= 0.5 * median && (state.kinds.get(s.fact.kind) ?? 0) < perKind,
  );
  if (!candidate) return;
  if (state.chosen.length < max) {
    add(state, candidate);
    return;
  }
  const isCourse = (s: ScoredFact) => s.fact.kind === "course";
  const isNonAcademic = (s: ScoredFact) => NON_ACADEMIC_KINDS.has(s.fact.kind);
  const removable = [...state.chosen]
    .sort((a, b) => value(a) - value(b) || b.fact.id.localeCompare(a.fact.id))
    .find((s) => {
      if (isCourse(s) && state.chosen.filter(isCourse).length === 1) return false;
      if (isNonAcademic(s) && state.chosen.filter(isNonAcademic).length === 1) return false;
      return true;
    });
  if (!removable || value(removable) > value(candidate) * 1.6) return;
  const rest = state.chosen.filter((s) => s !== removable);
  const rebuilt = emptyState();
  for (const s of rest) add(rebuilt, s);
  add(rebuilt, candidate);
  Object.assign(state, rebuilt);
}
