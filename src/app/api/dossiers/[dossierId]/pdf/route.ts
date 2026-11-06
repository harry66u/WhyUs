/**
 * PDF export of a dossier (owner only): GET -> application/pdf attachment
 * named like whyus-cornell-dossier.pdf.
 */
import type { NextRequest } from "next/server";
import { withDetailScopes } from "@/components/dossier/load";
import { dossierPdfFileName, firstName } from "@/components/dossier/model";
import { getUserOr401 } from "@/lib/auth/session";
import { getDossier } from "@/lib/data/dossiers";
import { getStudent } from "@/lib/data/students";
import { renderDossierPdf } from "@/lib/pdf/dossier-pdf";
import { jsonError } from "../../_lib/http";

// react-pdf and fontkit need Node APIs (fs, Buffer, zlib).
export const runtime = "nodejs";

type Context = { params: Promise<{ dossierId: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const user = await getUserOr401();
  if (user instanceof Response) return user;
  const { dossierId } = await params;
  const stored = await getDossier(user.id, dossierId);
  if (!stored) return jsonError("This dossier was not found in your account.", 404);

  const [dossier, student] = await Promise.all([withDetailScopes(stored), getStudent(user.id, stored.studentId)]);

  let bytes: Uint8Array;
  try {
    bytes = await renderDossierPdf(dossier, { preparedFor: firstName(student?.name) });
  } catch (err) {
    console.error("[pdf] could not render dossier", dossierId, err);
    return jsonError("The PDF could not be created. Try again in a moment.", 500);
  }

  const fileName = dossierPdfFileName(dossier);
  const body = new Uint8Array(bytes); // a plain ArrayBuffer-backed copy for the Response body
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
