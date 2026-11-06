import { ButtonLink } from "@/components/ui/button";

export default function SharedDossierNotFound() {
  return (
    <div className="mx-auto max-w-[460px] py-16 text-center">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-fg">This link is not active</h1>
      <p className="mt-2 text-sm text-muted">
        The person who shared this dossier may have stopped sharing it, or the link was copied incompletely. Ask them for a new link.
      </p>
      <div className="mt-8 flex justify-center">
        <ButtonLink href="/" variant="secondary">
          About WhyUs
        </ButtonLink>
      </div>
    </div>
  );
}
