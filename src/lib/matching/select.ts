/**
 * Choosing the 6-8 details of a dossier from scored, verified facts, and the
 * basis each detail's fit sentence cites (an activity, an interest, or an
 * intended major).
 *
 * Greedy over the ranking, with hard rules:
 * - a detail cites an activity only through a specific shared theme (its
 *   bases, see rank.ts); without any basis it is left out unless the dossier
 *   would otherwise have fewer than the minimum number of details;
 * - at most one detail per (activity, primary theme) and at most two details
 *   per activity; a detail grounded in a stated interest or intended major
 *   must add a theme no other detail covers (so a jazz ensemble cannot slip in
 *   through "jazz trumpet" after the Jazz Band already has its jazz detail);
 * - at most 3 details of one kind (relaxed only if fewer than the minimum could be chosen);
 * - prompt focus: when the prompt asks about the academic program or a specific
 *   college or school, at least 5 details are academic and at most 2 are
 *   university-wide extracurriculars (mixed prompts: at least 4 and at most 3).
 * When a detail's (activity, theme) slot is taken, it may be filed under a
 * nearly-as-strong alternative theme, or the detail holding the slot moves to
 * one of its own alternatives. Soft preferences: repeats of the same source
 * page or person are discounted, and a detail cited through a weaker basis
 * than its best is discounted. Then at least one course and (except for
 * academic prompts) one non-academic detail when a strong one exists; stop at
 * the minimum once the rest are weak.
 */
import type { FactKind } from "@/lib/types";
import { NON_ACADEMIC_KINDS } from "./features";
import type { Basis, PromptFocus, PromptMode, ScoredFact } from "./rank";

export interface SelectOptions {
  min?: number;
  max?: number;
  maxPerKind?: number;
  /** Value used to rank candidates (defaults to the ranking score). */
  value?: (s: ScoredFact) => number;
  /** What the prompt asks about (sets the academic minimum and the extracurricular cap). Default: open. */
  focus?: Pick<PromptFocus, "mode">;
}

/** A selected detail with the basis its fit sentence cites (null: nothing specific connects it). */
export type SelectedFact = ScoredFact & { cite: Basis | null };

/** Academic minimum and cap on university-wide extracurricular details, by prompt mode. */
export const MODE_RULES: Record<PromptMode, { minAcademic: number; maxExtracurricular: number }> = {
  academic: { minAcademic: 5, maxExtracurricular: 2 },
  mixed: { minAcademic: 4, maxExtracurricular: 3 },
  community: { minAcademic: 2, maxExtracurricular: 5 },
  open: { minAcademic: 3, maxExtracurricular: 3 },
};

export const MAX_PER_ACTIVITY = 2;
/** At most this many details share one primary theme (across different activities). */
const MAX_PER_THEME = 3;

interface Choice {
  s: ScoredFact;
  cite: Basis | null;
}

interface State {
  chosen: Choice[];
  ids: Set<string>;
  kinds: Map<FactKind, number>;
  /** "<source>|<theme>" of chosen bases */
  pairs: Set<string>;
  /** source -> count */
  sources: Map<string, number>;
  /** primary theme -> count */
  themes: Map<string, number>;
  pages: Set<string>;
  people: Set<string>;
  academic: number;
  extracurricular: number;
}

type Slots = Pick<State, "pairs" | "sources" | "themes">;

function emptyState(): State {
  return {
    chosen: [],
    ids: new Set(),
    kinds: new Map(),
    pairs: new Set(),
    sources: new Map(),
    themes: new Map(),
    pages: new Set(),
    people: new Set(),
    academic: 0,
    extracurricular: 0,
  };
}

const sourceKey = (b: Basis) => `${b.kind}:${b.sourceId}`;
const slotKey = (b: Basis) => `${sourceKey(b)}|${b.theme}`;

/** University-wide and not academic: a club, tradition, place, amenity, or hobby connection. */
export function isExtracurricular(s: ScoredFact): boolean {
  return !s.academic && s.unit !== "unit";
}

function add(state: State, p: Choice) {
  state.chosen.push(p);
  state.ids.add(p.s.fact.id);
  state.kinds.set(p.s.fact.kind, (state.kinds.get(p.s.fact.kind) ?? 0) + 1);
  if (p.cite) {
    state.pairs.add(slotKey(p.cite));
    state.sources.set(sourceKey(p.cite), (state.sources.get(sourceKey(p.cite)) ?? 0) + 1);
    state.themes.set(p.cite.theme, (state.themes.get(p.cite.theme) ?? 0) + 1);
  }
  state.pages.add(p.s.fact.sourceUrl);
  for (const person of p.s.fact.people ?? []) state.people.add(person.toLowerCase());
  if (p.s.academic) state.academic++;
  if (isExtracurricular(p.s)) state.extracurricular++;
}

function rebuild(picks: Choice[]): State {
  const state = emptyState();
  for (const p of picks) add(state, p);
  return state;
}

/**
 * Relaxation levels for bases: 0 strict; 1 interest and major bases may repeat a
 * theme another detail covers; 2 a detail may go without a basis.
 */
type Level = 0 | 1 | 2;

function admissible(state: Slots, b: Basis, level: Level): boolean {
  if (state.pairs.has(slotKey(b))) return false;
  if ((state.sources.get(sourceKey(b)) ?? 0) >= MAX_PER_ACTIVITY) return false;
  if ((state.themes.get(b.theme) ?? 0) >= MAX_PER_THEME) return false;
  if (b.kind !== "activity" && level === 0 && (state.themes.get(b.theme) ?? 0) > 0) return false;
  return true;
}

/** The same basis filed under another of its themes (slightly less preferred than its primary). */
function filedUnder(b: Basis, theme: string): Basis {
  if (theme === b.theme) return b;
  return {
    ...b,
    theme,
    themes: [theme, ...b.themes.filter((t) => t !== theme)],
    alternatives: [b.theme, ...b.alternatives.filter((t) => t !== theme)],
    value: b.value * 0.97,
  };
}

interface Option {
  cite: Basis | null;
  /** The chosen detail (index) that moves to another theme of its basis to free the slot. */
  relocate?: { index: number; to: Basis };
}

/** The best way this fact may still be cited, given what is already chosen. */
function optionFor(state: State, s: ScoredFact, level: Level): Option | null {
  for (const b of s.bases) {
    for (const t of [b.theme, ...b.alternatives]) {
      const c = filedUnder(b, t);
      if (admissible(state, c, level)) return { cite: c };
    }
    // The primary slot is held by another detail that could be filed under one of its alternatives.
    const index = state.chosen.findIndex((p) => p.cite && slotKey(p.cite) === slotKey(b));
    const holder = index >= 0 ? state.chosen[index] : undefined;
    if (!holder?.cite) continue;
    const without = rebuild(state.chosen.filter((_, i) => i !== index));
    for (const t2 of holder.cite.alternatives) {
      const moved = filedUnder(holder.cite, t2);
      if (!admissible(without, moved, 0)) continue;
      const after = rebuild([...without.chosen, { s: holder.s, cite: moved }]);
      if (admissible(after, b, level)) return { cite: b, relocate: { index, to: moved } };
    }
  }
  return level >= 2 ? { cite: null } : null;
}

/** State after taking `s` with `option` (applying a relocation if there is one). */
function take(state: State, s: ScoredFact, option: Option): State {
  if (option.relocate) {
    const { index, to } = option.relocate;
    const next = rebuild(state.chosen.map((p, i) => (i === index ? { s: p.s, cite: to } : p)));
    add(next, { s, cite: option.cite });
    return next;
  }
  add(state, { s, cite: option.cite });
  return state;
}

function adjusted(state: State, s: ScoredFact, cite: Basis | null, value: (s: ScoredFact) => number): number {
  let v = value(s);
  const best = s.bases[0];
  if (cite && best && best.value > 0) v *= 0.55 + 0.45 * Math.min(1, cite.value / best.value);
  if (!cite) v *= 0.5;
  if (state.pages.has(s.fact.sourceUrl)) v *= 0.8;
  if ((s.fact.people ?? []).some((p) => state.people.has(p.toLowerCase()))) v *= 0.85;
  return v;
}

function weakAfterMin(v: number, top: number): boolean {
  return v < 0.12 || v < 0.32 * top;
}

export function selectDetails(ranked: ScoredFact[], opts: SelectOptions = {}): SelectedFact[] {
  const min = opts.min ?? 6;
  const max = opts.max ?? 8;
  const perKind = opts.maxPerKind ?? 3;
  const value = opts.value ?? ((s: ScoredFact) => s.score);
  const mode = opts.focus?.mode ?? "open";
  const rules = MODE_RULES[mode];
  const minAcademic = Math.min(rules.minAcademic, max);
  const pool = [...ranked].sort((a, b) => value(b) - value(a) || a.fact.id.localeCompare(b.fact.id));
  const top = pool[0] ? value(pool[0]) : 0;
  let state = emptyState();

  const allowedByFocus = (st: State, s: ScoredFact) => {
    if (isExtracurricular(s) && st.extracurricular >= rules.maxExtracurricular) return false;
    // Keep room for the academic minimum.
    if (!s.academic && st.chosen.length - st.academic + 1 > max - minAcademic) return false;
    return true;
  };

  const pick = (capKinds: boolean, level: Level): { s: ScoredFact; option: Option } | null => {
    let best: { s: ScoredFact; option: Option } | null = null;
    let bestV = -1;
    for (const s of pool) {
      if (state.ids.has(s.fact.id)) continue;
      if (capKinds && (state.kinds.get(s.fact.kind) ?? 0) >= perKind) continue;
      if (!allowedByFocus(state, s)) continue;
      const option = optionFor(state, s, level);
      if (!option) continue;
      const v = adjusted(state, s, option.cite, value);
      if (v > bestV + 1e-12) {
        best = { s, option };
        bestV = v;
      }
    }
    return best;
  };

  while (state.chosen.length < max) {
    let next = pick(true, 0);
    if (!next && state.chosen.length < min) next = pick(false, 0) ?? pick(false, 1) ?? pick(false, 2);
    if (!next) break;
    // Past the minimum, stop once the rest are weak (unless the academic minimum still needs filling).
    if (state.chosen.length >= min && weakAfterMin(value(next.s), top) && !(state.academic < minAcademic && next.s.academic)) break;
    state = take(state, next.s, next.option);
  }

  state = ensureAcademic(state, pool, minAcademic, max, value);
  state = ensure(state, pool, (s) => s.fact.kind === "course", { max, perKind, value, maxExtracurricular: rules.maxExtracurricular, minAcademic });
  if (mode !== "academic") {
    state = ensure(state, pool, (s) => NON_ACADEMIC_KINDS.has(s.fact.kind), { max, perKind, value, maxExtracurricular: rules.maxExtracurricular, minAcademic });
  }

  return state.chosen
    .sort((a, b) => value(b.s) - value(a.s) || a.s.fact.id.localeCompare(b.s.fact.id))
    .map((p) => ({ ...p.s, cite: p.cite }));
}

/**
 * Meet the academic minimum when academic candidates remain: add one if there
 * is room, otherwise replace the weakest non-academic detail.
 */
function ensureAcademic(state: State, pool: ScoredFact[], minAcademic: number, max: number, value: (s: ScoredFact) => number): State {
  for (let guard = 0; guard < 8 && state.academic < minAcademic; guard++) {
    const removable =
      state.chosen.length >= max
        ? [...state.chosen].filter((p) => !p.s.academic).sort((a, b) => value(a.s) - value(b.s) || b.s.fact.id.localeCompare(a.s.fact.id))[0]
        : undefined;
    if (state.chosen.length >= max && !removable) break;
    const base = removable ? rebuild(state.chosen.filter((p) => p !== removable)) : state;
    let best: { s: ScoredFact; option: Option } | null = null;
    let bestV = -1;
    for (const s of pool) {
      if (!s.academic || base.ids.has(s.fact.id) || (removable && s === removable.s)) continue;
      const option = optionFor(base, s, 0) ?? optionFor(base, s, 1);
      if (!option?.cite) continue;
      const v = adjusted(base, s, option.cite, value);
      if (v > bestV + 1e-12) {
        best = { s, option };
        bestV = v;
      }
    }
    if (!best) break;
    state = take(base, best.s, best.option);
  }
  return state;
}

/**
 * Make sure one detail satisfies `want` when a strong candidate exists:
 * add it if there is room, otherwise replace the weakest detail that is not
 * the only course or the only non-academic detail.
 */
function ensure(
  state: State,
  pool: ScoredFact[],
  want: (s: ScoredFact) => boolean,
  opts: { max: number; perKind: number; value: (s: ScoredFact) => number; maxExtracurricular: number; minAcademic: number },
): State {
  const { max, perKind, value, maxExtracurricular, minAcademic } = opts;
  if (state.chosen.length === 0 || state.chosen.some((p) => want(p.s))) return state;
  const scores = state.chosen.map((p) => value(p.s)).sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)];
  const isCourse = (s: ScoredFact) => s.fact.kind === "course";
  const isNonAcademic = (s: ScoredFact) => NON_ACADEMIC_KINDS.has(s.fact.kind);
  for (const s of pool) {
    if (state.ids.has(s.fact.id) || !want(s) || s.fit < 0.3 || value(s) < 0.5 * median || (state.kinds.get(s.fact.kind) ?? 0) >= perKind) continue;
    if (state.chosen.length < max) {
      const option = optionFor(state, s, 0);
      if (!option?.cite) continue;
      if (isExtracurricular(s) && state.extracurricular >= maxExtracurricular) continue;
      return take(state, s, option);
    }
    const removable = [...state.chosen]
      .sort((a, b) => value(a.s) - value(b.s) || b.s.fact.id.localeCompare(a.s.fact.id))
      .find((p) => {
        if (isCourse(p.s) && state.chosen.filter((x) => isCourse(x.s)).length === 1) return false;
        if (isNonAcademic(p.s) && state.chosen.filter((x) => isNonAcademic(x.s)).length === 1) return false;
        // Never trade an academic detail away below the academic minimum.
        if (p.s.academic && !s.academic && state.academic - 1 < minAcademic) return false;
        return true;
      });
    if (!removable || value(removable.s) > value(s) * 1.6) return state;
    const rebuilt = rebuild(state.chosen.filter((p) => p !== removable));
    const option = optionFor(rebuilt, s, 0);
    if (!option?.cite) continue;
    if (isExtracurricular(s) && rebuilt.extracurricular >= maxExtracurricular) continue;
    return take(rebuilt, s, option);
  }
  return state;
}
