/**
 * Common App activities section: field limits and activity types.
 *
 * Shared by the parser (to recognize the printed layout) and the profile
 * editor (to show the same limits students see in the application).
 */

/** Character limits of the Common App activities fields. */
export const COMMON_APP_LIMITS = {
  position: 50,
  organization: 100,
  description: 150,
  activities: 10,
} as const;

/** Activity types offered in the Common App "Activity type" menu. */
export const COMMON_APP_ACTIVITY_TYPES: readonly string[] = [
  "Academic",
  "Art",
  "Athletics: Club",
  "Athletics: JV/Varsity",
  "Career-Oriented",
  "Community Service (Volunteer)",
  "Computer/Technology",
  "Cultural",
  "Dance",
  "Debate/Speech",
  "Environmental",
  "Family Responsibilities",
  "Foreign Exchange",
  "Foreign Language",
  "Internship",
  "Journalism/Publication",
  "Junior R.O.T.C.",
  "LGBT",
  "Music: Instrumental",
  "Music: Vocal",
  "Religious",
  "Research",
  "Robotics",
  "School Spirit",
  "Science/Math",
  "Social Justice",
  "Student Govt./Politics",
  "Theater/Drama",
  "Work (Paid)",
  "Other Club/Activity",
];

function tokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Loose matchers: "Athletics JV / Varsity" and "athletics: jv/varsity" both match. */
const TYPE_MATCHERS: { type: string; prefix: RegExp; exact: RegExp }[] = [...COMMON_APP_ACTIVITY_TYPES]
  .sort((a, b) => tokens(b).length - tokens(a).length || b.length - a.length)
  .map((type) => {
    const body = tokens(type).join("[^a-z0-9]*");
    return {
      type,
      // Trailing punctuation belongs to the type: "Work (Paid)", "Junior R.O.T.C.".
      prefix: new RegExp(`^[^a-z0-9]*${body}[^a-z0-9\\s]*(?![a-z0-9])`, "i"),
      exact: new RegExp(`^[^a-z0-9]*${body}[^a-z0-9]*$`, "i"),
    };
  });

/** The canonical Common App type when `value` names one exactly (ignoring case and punctuation). */
export function canonicalActivityType(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return TYPE_MATCHERS.find((m) => m.exact.test(value))?.type;
}

/**
 * When `line` starts with a Common App activity type, returns the canonical
 * type and the rest of the line ("Environmental  10, 11, 12" -> Environmental).
 */
export function matchActivityTypePrefix(line: string): { type: string; rest: string } | null {
  for (const m of TYPE_MATCHERS) {
    const hit = m.prefix.exec(line);
    if (hit) return { type: m.type, rest: line.slice(hit[0].length).trim() };
  }
  return null;
}
