import { createHash, randomBytes } from "node:crypto";

/** Random URL-safe id. 12 bytes = 96 bits by default. */
export function newId(bytes = 12): string {
  return randomBytes(bytes).toString("base64url");
}

/** Random secret token (share links, sign-in links, sessions). 32 bytes = 256 bits. */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Lowercase, hyphenated slug for stable ids. */
export function slugify(input: string, max = 48): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Stable fact id: school + slug(title) + short hash of url and quote. */
export function factId(schoolId: string, title: string, sourceUrl: string, quote: string): string {
  return `${schoolId}:${slugify(title, 40)}:${sha256(`${sourceUrl}\n${quote}`).slice(0, 6)}`;
}
