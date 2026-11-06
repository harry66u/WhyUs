/**
 * Cross-school angle coordination for one student.
 *
 * Leads: every dossier must lead with a different angle key, and leads should
 * also differ in primary activity and primary theme where possible. Among the
 * assignments that best satisfy those rules (in that order of priority), the
 * one with the highest total fit wins; the current lead gets a small bonus so
 * that nothing churns without a reason.
 *
 * Secondary angles: chosen to repeat other dossiers' angles as little as possible.
 *
 * Candidates per dossier are its shown angles plus its stored alternates
 * (`angleOptions`). Returns only the dossiers whose angles changed.
 */
import type { Dossier, EssayAngle } from "@/lib/types";
import { KIND_SUBSTANCE } from "./angles";

interface Candidate {
  angle: EssayAngle;
  key: string;
  activity: string | null;
  theme: string;
  score: number;
  wasLead: boolean;
  wasShown: boolean;
}

function primaryActivity(a: EssayAngle): string | null {
  if (a.activityIds?.[0]) return a.activityIds[0];
  const head = a.key.split("|")[0];
  return head && !["interests", "majors", "school"].includes(head) ? head : null;
}

function primaryTheme(a: EssayAngle): string {
  return a.themes?.[0] ?? a.key.split("|")[1] ?? a.key;
}

/** Same ingredients as the engine's angle score: fit, rank, uniqueness, and substance of the supporting details. */
function angleScore(d: Dossier, a: EssayAngle): number {
  const byId = new Map(d.details.map((x) => [x.factId, x]));
  const support = (a.factIds ?? []).map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (support.length === 0) return 0;
  const base = support.reduce((n, x) => n + (x.fit?.score ?? 0) * Math.max(0.6, 1.1 - 0.05 * (x.rank - 1)), 0);
  const uniq = support.reduce((n, x) => n + (x.uniqueness?.score ?? 60), 0) / support.length;
  const substance = support.reduce((n, x) => n + (KIND_SUBSTANCE[x.kind] ?? 0.9), 0) / support.length;
  // Interest and major angles borrow the overall fit of their details; discount them so
  // an angle built on the student's own activity leads whenever one is available.
  const generic = /^(?:interests|majors|school)\|/.test(a.key) ? 0.35 : 1;
  return base * (1 + 0.3 * Math.min(2, support.length - 1)) * (0.6 + 0.4 * (uniq / 100)) * substance * generic;
}

function candidatesFor(d: Dossier): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (a: EssayAngle, shown: boolean) => {
    if (!a?.key || seen.has(a.key)) return;
    seen.add(a.key);
    out.push({ angle: a, key: a.key, activity: primaryActivity(a), theme: primaryTheme(a), score: angleScore(d, a), wasLead: shown && a.isLead, wasShown: shown });
  };
  for (const a of d.angles ?? []) push(a, true);
  for (const a of d.angleOptions ?? []) push(a, false);
  return out.sort((x, y) => Number(y.wasLead) - Number(x.wasLead) || y.score - x.score || x.key.localeCompare(y.key));
}

type Penalty = [number, number, number];

function dupCount(values: (string | null)[]): number {
  const seen = new Map<string, number>();
  let dups = 0;
  for (const v of values) {
    if (v == null) continue;
    const n = seen.get(v) ?? 0;
    if (n > 0) dups++;
    seen.set(v, n + 1);
  }
  return dups;
}

function better(p: Penalty, s: number, bestP: Penalty, bestS: number): boolean {
  for (let i = 0; i < 3; i++) {
    if (p[i] !== bestP[i]) return p[i] < bestP[i];
  }
  return s > bestS + 1e-9;
}

const NODE_LIMIT = 250_000;

/** Choose one lead per dossier (index into its candidates). */
function assignLeads(cands: Candidate[][]): number[] {
  const n = cands.length;
  const order = cands.map((c, i) => i).sort((a, b) => cands[a].length - cands[b].length || a - b);
  const maxScore = cands.map((c) => Math.max(0, ...c.map((x) => leadValue(x))));

  // Greedy start: strongest available candidate that adds no conflict.
  const greedy = new Array<number>(n).fill(0);
  const usedK = new Set<string>();
  const usedA = new Set<string>();
  const usedT = new Set<string>();
  for (const i of order) {
    const list = cands[i];
    let pick = 0;
    let bestRank = Infinity;
    list.forEach((c, j) => {
      const r = (usedK.has(c.key) ? 100 : 0) + (c.activity && usedA.has(c.activity) ? 10 : 0) + (usedT.has(c.theme) ? 1 : 0);
      if (r < bestRank) {
        bestRank = r;
        pick = j;
      }
    });
    greedy[i] = pick;
    const c = list[pick];
    if (c) {
      usedK.add(c.key);
      if (c.activity) usedA.add(c.activity);
      usedT.add(c.theme);
    }
  }
  let best = [...greedy];
  let bestP = penalty(cands, best);
  let bestS = total(cands, best);

  const current = new Array<number>(n).fill(0);
  let nodes = 0;
  const keys: string[] = [];
  const acts: (string | null)[] = [];
  const themes: string[] = [];
  const dfs = (depth: number, score: number) => {
    if (++nodes > NODE_LIMIT) return;
    const partial: Penalty = [dupCount(keys), dupCount(acts), dupCount(themes)];
    if (comparePenalty(partial, bestP) > 0) return;
    let optimistic = score;
    for (let k = depth; k < n; k++) optimistic += maxScore[order[k]];
    if (comparePenalty(partial, bestP) === 0 && optimistic <= bestS + 1e-9 && depth > 0) return;
    if (depth === n) {
      if (better(partial, score, bestP, bestS)) {
        best = [...current];
        bestP = partial;
        bestS = score;
      }
      return;
    }
    const i = order[depth];
    const list = cands[i];
    for (let j = 0; j < list.length; j++) {
      const c = list[j];
      current[i] = j;
      keys.push(c.key);
      acts.push(c.activity);
      themes.push(c.theme);
      dfs(depth + 1, score + leadValue(c));
      keys.pop();
      acts.pop();
      themes.pop();
    }
  };
  if (n > 0 && cands.every((c) => c.length > 0)) dfs(0, 0);
  return best;
}

function leadValue(c: Candidate): number {
  return c.score * (c.wasLead ? 1.05 : 1) + (c.wasLead ? 0.01 : 0);
}

function comparePenalty(a: Penalty, b: Penalty): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function penalty(cands: Candidate[][], pick: number[]): Penalty {
  const chosen = pick.map((j, i) => cands[i][j]).filter(Boolean);
  return [dupCount(chosen.map((c) => c.key)), dupCount(chosen.map((c) => c.activity)), dupCount(chosen.map((c) => c.theme))];
}

function total(cands: Candidate[][], pick: number[]): number {
  return pick.reduce((s, j, i) => s + (cands[i][j] ? leadValue(cands[i][j]) : 0), 0);
}

function sameAngles(a: EssayAngle[], b: EssayAngle[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.key === b[i].key && x.isLead === b[i].isLead && x.line === b[i].line);
}

/**
 * Re-assign lead angles across one student's dossiers so no two schools lead
 * with the same angle, then pick secondary angles that repeat as little as
 * possible. Returns only the dossiers whose angles changed.
 */
export function coordinateAngles(dossiers: Dossier[]): Dossier[] {
  const list = (dossiers ?? []).filter((d) => d && Array.isArray(d.angles));
  if (list.length === 0) return [];
  const cands = list.map(candidatesFor);
  const leads = assignLeads(cands);

  const leadKeys = new Map<string, number>();
  leads.forEach((j, i) => {
    const c = cands[i][j];
    if (c) leadKeys.set(c.key, (leadKeys.get(c.key) ?? 0) + 1);
  });

  const secondaryUse = new Map<string, number>();
  const changed: Dossier[] = [];
  // Stable order for secondary choices: by dossier id.
  const indexes = list.map((_, i) => i).sort((a, b) => list[a].id.localeCompare(list[b].id));
  const nextAngles = new Array<{ shown: EssayAngle[]; options: EssayAngle[] } | null>(list.length).fill(null);
  for (const i of indexes) {
    const d = list[i];
    const options = cands[i];
    const lead = options[leads[i]];
    if (!lead) continue;
    const shownCount = Math.max(2, Math.min(3, d.angles.length));
    const pool = options.filter((c) => c !== lead);
    const picked: Candidate[] = [];
    while (picked.length < shownCount - 1 && pool.length > 0) {
      const taken = [lead, ...picked];
      const distinct = (c: Candidate) => (!c.activity || !taken.some((p) => p.activity === c.activity)) && !taken.some((p) => p.theme === c.theme);
      const value = (c: Candidate) => {
        let v = c.score * (c.wasShown ? 1.1 : 1);
        if (leadKeys.has(c.key)) v *= 0.3; // another school leads with this angle
        v *= Math.pow(0.7, secondaryUse.get(c.key) ?? 0);
        // Angles in one dossier should point in different directions.
        if (!distinct(c)) v *= 0.35;
        return v;
      };
      pool.sort((a, b) => value(b) - value(a) || a.key.localeCompare(b.key));
      const next = pool[0];
      // A third angle must add something: skip it when it is weak or repeats this dossier's direction.
      if (picked.length >= 1 && (value(next) < 0.3 * lead.score || !distinct(next))) break;
      picked.push(pool.shift()!);
    }
    for (const p of picked) secondaryUse.set(p.key, (secondaryUse.get(p.key) ?? 0) + 1);
    const shown = [lead, ...picked].map((c, k) => ({ ...c.angle, isLead: k === 0 }));
    const rest = pool.map((c) => ({ ...c.angle, isLead: false }));
    nextAngles[i] = { shown, options: rest };
  }

  list.forEach((d, i) => {
    const next = nextAngles[i];
    if (!next) return;
    if (sameAngles(d.angles, next.shown)) return;
    changed.push({ ...d, angles: next.shown, angleOptions: next.options });
  });
  return changed;
}
