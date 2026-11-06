import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { DossierDocument, DossierPrintStyles } from "@/components/dossier";
import { withDetailScopes } from "@/components/dossier/load";
import { getSharedDossier } from "@/lib/data/dossiers";
import { PrintButton } from "./print-button";

type Props = { params: Promise<{ token: string }> };

/** One lookup per request, shared by the metadata and the page. Unknown or revoked tokens give null. */
const loadShared = cache(async (token: string) => {
  // Always render at request time (the lookup is a database read Next cannot see):
  // a link the owner stops sharing must stop working immediately, never be served from a cache.
  await connection();
  const dossier = await getSharedDossier(token);
  return dossier ? withDetailScopes(dossier) : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const dossier = await loadShared(token);
  return {
    title: dossier ? `${dossier.schoolName} dossier` : "Shared dossier",
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
  };
}

export default async function SharedDossierPage({ params }: Props) {
  const { token } = await params;
  const dossier = await loadShared(token);
  if (!dossier) notFound();

  // Read-only briefing. It is rendered on the server from the dossier's
  // presentational fields only: no account email, student name, or internal ids.
  return (
    <div className="mx-auto w-full max-w-[760px]">
      <DossierPrintStyles />
      <div data-print-hide className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[52ch] text-sm text-muted">
          A research briefing shared from WhyUs. Every detail links to the official page it came from, with the date it was verified.
        </p>
        <PrintButton />
      </div>
      <DossierDocument dossier={dossier} idPrefix="shared" animated />
    </div>
  );
}
