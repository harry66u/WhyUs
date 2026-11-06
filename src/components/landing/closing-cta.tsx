import { ButtonLink } from "@/components/ui/button";

export function ClosingCta() {
  return (
    <section aria-labelledby="start-title" className="border-t border-line">
      <div className="mx-auto max-w-[1200px] px-4 py-24 sm:px-6 lg:py-32">
        <h2 id="start-title" className="max-w-[16em] text-3xl font-semibold tracking-[-0.035em] text-balance text-fg sm:text-4xl sm:tracking-[-0.04em]">
          Start with one school. It’s free.
        </h2>
        <p className="mt-5 max-w-[36rem] text-md text-pretty text-muted sm:text-lg">
          Sign in with your email, add your activities, and watch your first dossier come together in about two minutes.
        </p>
        <div className="mt-9">
          <ButtonLink href="/login" variant="primary" size="lg" className="w-full sm:w-auto">
            Build your first dossier, free
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
