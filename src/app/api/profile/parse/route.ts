/**
 * POST /api/profile/parse
 *
 * Reads a student's activities from pasted text or an uploaded PDF (Common App
 * activities section or resume) and returns them for review. Nothing is saved
 * here: the student reviews the result and saves it with the profile.
 *
 * Body: multipart/form-data with `file` (PDF, up to 5 MB) or `text`, or JSON `{ "text": "..." }`.
 */
import { getUserOr401 } from "@/lib/auth/session";
import { MAX_PARSE_CHARS, PdfTextError, extractPdfText, parseActivitiesText } from "@/lib/profile/parse";

export const maxDuration = 90;

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_PDF_BYTES + 256 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 30;

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

const limiter = globalThis as unknown as { __whyusParseHits?: Map<string, number[]> };

/** At most RATE_LIMIT parses per account in RATE_WINDOW_MS (parsing can call Claude). */
function allow(userId: string): boolean {
  const now = Date.now();
  const hits: Map<string, number[]> = (limiter.__whyusParseHits ??= new Map<string, number[]>());
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
  }
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

class BodyTooLarge extends Error {}

/** Reads the request body, stopping as soon as it passes `max` bytes. */
async function readCapped(request: Request, max: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function looksLikePdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

const TOO_LARGE = "That file is larger than 5 MB. Export a smaller PDF or paste the text instead.";

export async function POST(request: Request): Promise<Response> {
  const user = await getUserOr401();
  if (user instanceof Response) return user;
  if (!allow(user.id)) return error(429, "Too many imports in a few minutes. Wait a little and try again.");

  const contentType = request.headers.get("content-type") ?? "";
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return error(413, TOO_LARGE);

  let body: Uint8Array;
  try {
    body = await readCapped(request, MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof BodyTooLarge) return error(413, TOO_LARGE);
    return error(400, "The upload did not finish. Try again.");
  }

  let text = "";
  let sourceKind: "pdf" | "text" = "text";
  let fileName: string | null = null;

  if (contentType.toLowerCase().startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await new Response(body as BodyInit, { headers: { "content-type": contentType } }).formData();
    } catch {
      return error(400, "The upload could not be read. Try again.");
    }
    const file = form.get("file");
    const pasted = form.get("text");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_PDF_BYTES) return error(413, TOO_LARGE);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!looksLikePdf(bytes)) return error(415, "Upload a PDF file, or paste the text instead.");
      try {
        text = await extractPdfText(bytes);
      } catch (err) {
        if (err instanceof PdfTextError && err.code === "encrypted") {
          return error(422, "This PDF is password-protected. Save a copy without a password, or paste the text instead.");
        }
        return error(422, "This file could not be read as a PDF. Paste the text instead.");
      }
      if (text.replace(/\s+/g, "").length < 20) {
        return error(422, "This PDF has no selectable text. It may be a scan or a photo; paste the text instead.");
      }
      sourceKind = "pdf";
      fileName = file.name || null;
    } else if (typeof pasted === "string") {
      text = pasted;
    } else {
      return error(400, "Choose a PDF or paste your activities.");
    }
  } else if (contentType.toLowerCase().startsWith("application/json")) {
    try {
      const data: unknown = JSON.parse(new TextDecoder().decode(body));
      text = data && typeof data === "object" && typeof (data as { text?: unknown }).text === "string" ? (data as { text: string }).text : "";
    } catch {
      return error(400, "The request could not be read.");
    }
  } else {
    return error(415, "Send a PDF upload or text.");
  }

  if (!text.trim()) return error(400, "Paste your activities or choose a PDF first.");

  const parsed = await parseActivitiesText(text, { signal: request.signal });
  return Response.json(
    {
      activities: parsed.activities,
      engine: parsed.engine,
      format: parsed.format ?? null,
      warnings: parsed.warnings,
      sourceKind,
      fileName,
      sourceText: text.slice(0, MAX_PARSE_CHARS),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
