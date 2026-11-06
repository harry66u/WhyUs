/**
 * Graduation years. A school year runs from August to June, so from August on
 * the current senior class graduates next calendar year.
 */

/** The graduation year of this year's high school seniors. */
export function seniorClassYear(now: Date = new Date()): number {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 7 ? year + 1 : year;
}

/** Choices for a graduation year picker: last year's class through four years out. */
export function graduationYearOptions(now: Date = new Date(), include?: number | null): number[] {
  const senior = seniorClassYear(now);
  const years = new Set<number>();
  for (let y = senior - 1; y <= senior + 4; y++) years.add(y);
  if (include && Number.isInteger(include)) years.add(include);
  return [...years].sort((a, b) => a - b);
}

/** Bounds accepted on save (wide enough that old profiles stay editable). */
export const GRADUATION_YEAR_MIN = 2000;
export const GRADUATION_YEAR_MAX = 2100;

export function isValidGraduationYear(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= GRADUATION_YEAR_MIN && value <= GRADUATION_YEAR_MAX;
}
