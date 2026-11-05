/**
 * Research terms. School research is shared across students and refreshed each
 * term: a fact verified before the current term started is re-verified before use.
 *
 * Fall: Aug-Dec, Spring: Jan-May, Summer: Jun-Jul.
 */
export function currentTerm(date: Date = new Date()): string {
  const m = date.getUTCMonth(); // 0-11
  const y = date.getUTCFullYear();
  if (m >= 7) return `${y}-fall`;
  if (m <= 4) return `${y}-spring`;
  return `${y}-summer`;
}

/** First day (UTC, YYYY-MM-DD) of the term containing `date`. */
export function termStart(date: Date = new Date()): string {
  const m = date.getUTCMonth();
  const y = date.getUTCFullYear();
  const month = m >= 7 ? 8 : m <= 4 ? 1 : 6;
  return `${y}-${String(month).padStart(2, "0")}-01`;
}

/** True when a YYYY-MM-DD verification date falls inside the current term. */
export function verifiedThisTerm(verifiedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!verifiedAt) return false;
  return verifiedAt >= termStart(now);
}

export function isoDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
