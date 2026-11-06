/**
 * Cross-school angle coordination for one student.
 *
 * Leads: every dossier must lead with a different angle key, and leads should
 * also differ in primary activity and primary theme. Among the assignments that
 * best satisfy those rules (in that order of priority), the one with the
 * highest total lead value wins (branch and bound; exhaustive for a normal list
 * of schools). Lead value is the angle's strength (relevance to the intended
 * majors and the prompt, strength and substance of its details, specificity;
 * computed by the engine and stored on the angle), weighted so that an angle
 * built on the student's own activity beats one built on a stated interest, and
 * an extracurricular angle (jazz, cycling) leads only when no academic angle of
 * reasonable strength is left for that school. The current lead gets a tiny
 * bonus so that equal options do not churn.
 *
 * Secondary angles: share no detail with the lead or with each other, point in
 * a different direction from the lead, and repeat other dossiers' angles as
 * little as possible.
 *
 * Candidates per dossier are its shown angles plus its stored alternates
 * (`angleOptions`). Returns only the dossiers whose angles changed.
 */
import type { Dossier, EssayAngle } from "@/lib/types";
import { KIND_SUBSTANCE, leadWeight, type ScoredEssayAngle } from "./angles";
import { HOBBY_GROUPS, themeGroup } from "./themes";

interface Candidate {
  angle: EssayAngle;
  key: string;
  activity: string | null;
  theme: string;
  score: number;
  academic: boolean;
  wasLead: boolean;
  wasShown: boolean;
  facts: Set<string>;
}

function primaryActivity(a: EssayAngle): string | null {
  if (a.activityIds?.[0]) return a.activityIds[0];
  const head = a.key.split("|")[0];
  return head && !["interests", "majors", "school"].includes(head) ? head : null;
}

function primaryTheme(a: EssayAngle): string {
  return a.themes?.[0] ?? a.key.split("|")[1] ?? a.key;
}

const ACADEMIC_KINDS = new Set(["course", "major", "faculty", "lab", "center"]);

/** Angles stored by an earlier engine carry no strength: rebuild one from the dossier's details. */
function legacyScore(d: Dossier, a: EssayAngle): number {
  const byId = new Map(d.details.map((x) => [x.factId, x]));
  const support = (a.factIds ?? []).map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (support.length === 0) return 0;
  const base = support.reduce((n, x) => n + (x.fit?.score ?? 0) * Math.max(0.6, 1.1 - 0.05 * (x.rank - 1)), 0);
  const uniq = support.reduce((n, x) => n + (x.uniqueness?.score ?? 60), 0) / support.length;
  const substance = support.reduce((n, x) => n + (KIND_SUBSTANCE[x.kind] ?? 0.9), 0) / support.length;
  return base * (1 + 0.3 * Math.min(2, support.length - 1)) * (0.6 + 0.4 * (uniq / 100)) * substance;
}

function legacyAcademic(d: Dossier, a: EssayAngle): boolean {
  const group = themeGroup(primaryTheme(a));
  if (group && HOBBY_GROUPS.has(group)) return false;
  const kinds = new Map(d.details.map((x) => [x.factId, x.kind]));
  return (a.factIds ?? []).some((id) => ACADEMIC_KINDS.has(kinds.get(id) ?? ""));
}

function candidatesFor(d: Dossier): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (a: EssayAngle, shown: boolean) => {
    if (!a?.key || seen.has(a.key)) return;
    seen.add(a.key);
    const stored = a as ScoredEssayAngle;
    const score = typeof stored.strength === "number" && Number.isFinite(stored.strength) && stored.strength >= 0 ? stored.strength : legacyScore(d, a);
    const academic = typeof stored.academic === "boolean" ? stored.academic : legacyAcademic(d, a);
    out.push({
      angle: a,
      key: a.key,
      activity: primaryActivity(a),
      theme: primaryTheme(a),
      score,
      academic,
      wasLead: shown && a.isLead,
      wasShown: shown,
      facts: new Set(a.factIds ?? []),
    });
  };
  for (const a of d.angles ?? []) push(a, true);
  for (const a of d.angleOptions ?? []) push(a, false);
  return out.sort((x, y) => leadValue(y) - leadValue(x) || x.key.localeCompare(y.key));
}

function leadValue(c: Candidate): number {
  return c.score * leadWeight({ activityId: c.activity, academic: c.academic, key: c.key }) * (c.wasLead ? 1.01 : 1);
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

function comparePenalty(a: Penalty, b: Penalty): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function better(p: Penalty, s: number, bestP: Penalty, bestS: number): boolean {
  const c = comparePenalty(p, bestP);
  if (c !== 0) return c < 0;
  return s > bestS + 1e-9;
}

const NODE_LIMIT = 400_000;

/** Choose one lead per dossier (index into its candidates): fewest conflicts first, then the highest total lead value. */
function assignLeads(cands: Candidate[][]): number[] {
  const n = cands.length;
  // Most constrained dossiers first.
  const order = cands.map((_, i) => i).sort((a, b) => cands[a].length - cands[b].length || a - b);
  const maxValue = cands.map((c) => Math.max(0, ...c.map(leadValue)));

  // Greedy start: the strongest available candidate that adds no conflict.
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
    const cmp = comparePenalty(partial, bestP);
    if (cmp > 0) return;
    if (cmp === 0 && depth > 0) {
      let optimistic = score;
      for (let k = depth; k < n; k++) optimistic += maxValue[order[k]];
      if (optimistic <= bestS + 1e-9) return;
    }
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
 * with the same angle (or the same activity or theme), maximizing total lead
 * value; then pick secondary angles that share no detail with the lead and
 * repeat as little as possible. Returns only the dossiers whose angles changed.
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
    const options = cands[i];
    const lead = options[leads[i]];
    if (!lead) continue;
    const pool = options.filter((c) => c !== lead);
    const picked: Candidate[] = [];
    const taken = new Set(lead.facts);
    for (;;) {
      if (picked.length >= 2) break;
      const shown = [lead, ...picked];
      const sameActivity = (c: Candidate) => c.activity != null && shown.some((p) => p.activity === c.activity);
      const sameTheme = (c: Candidate) => shown.some((p) => p.theme === c.theme);
      const value = (c: Candidate) => {
        let v = c.score * (c.wasShown ? 1.1 : 1) * (c.academic ? 1 : 0.7) * (c.activity ? 1 : 0.8);
        if (leadKeys.has(c.key)) v *= 0.3; // another school leads with this angle
        v *= Math.pow(0.7, secondaryUse.get(c.key) ?? 0);
        // Angles in one dossier should point in different directions.
        if (sameActivity(c)) v *= 0.4;
        if (sameTheme(c)) v *= 0.5;
        return v;
      };
      let eligible = pool.filter((c) => ![...c.facts].some((id) => taken.has(id)) && !(sameActivity(c) && sameTheme(c)));
      // Every dossier shows at least two angles; when nothing shares no detail, the least overlapping one stands in.
      if (eligible.length === 0 && picked.length === 0) {
        eligible = pool.filter((c) => !(sameActivity(c) && sameTheme(c)));
        eligible.sort((a, b) => [...a.facts].filter((id) => taken.has(id)).length - [...b.facts].filter((id) => taken.has(id)).length);
        eligible = eligible.slice(0, 1);
      }
      if (eligible.length === 0) break;
      eligible.sort((a, b) => value(b) - value(a) || a.key.localeCompare(b.key));
      const next = eligible[0];
      // A third angle must add a new direction and carry some weight.
      if (picked.length >= 1 && (value(next) < 0.3 * lead.score || sameActivity(next) || sameTheme(next))) break;
      picked.push(next);
      for (const id of next.facts) taken.add(id);
      pool.splice(pool.indexOf(next), 1);
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
