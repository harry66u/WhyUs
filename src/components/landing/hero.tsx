import { ButtonLink } from "@/components/ui/button";
import { toDemoView } from "./demo-view";
import { ResearchDemo } from "./research-demo";
import type { LandingDemo } from "./types";

function demoCaption(demo: LandingDemo): string {
  if (demo.source === "example") {
    return "Example data about a fictional school (example.edu). Real dossiers cite each college’s official pages.";
  }
  return `A replay for a sample student, built from ${demo.school.shortName}’s verified research base with the same ranking, matching, and swap test as a live run. The pages, quotes, and verification dates are real; the timing is shortened.`;
}

export function Hero({ demo }: { demo: LandingDemo }) {
  return (
    <section aria-labelledby="hero-title">
      <div className="mx-auto max-w-[1200px] px-4 pt-14 sm:px-6 sm:pt-20 lg:pt-24">
        <h1
          id="hero-title"
          className="max-w-[15em] text-3xl font-semibold tracking-[-0.035em] text-balance text-fg sm:text-4xl sm:tracking-[-0.04em] xl:text-5xl"
        >
          Specific, verified research for every “Why us?” essay.
        </h1>
        <p className="mt-6 max-w-[40rem] text-md text-pretty text-muted sm:text-lg">
          WhyUs reads each college’s official pages, verifies every fact, matches the details to what you have actually done, and never
          writes a word of your essay.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <ButtonLink href="/login" variant="primary" size="lg" className="w-full sm:w-auto">
            Build your first dossier, free
          </ButtonLink>
          <ButtonLink href="#how-it-works" variant="ghost" size="lg" className="w-full sm:w-auto">
            See how it works
          </ButtonLink>
        </div>
      </div>

      <div className="mx-auto mt-14 max-w-[1200px] px-4 pb-20 sm:mt-16 sm:px-6 lg:pb-28">
        <ResearchDemo demo={toDemoView(demo)} />
        <p className="mt-3 max-w-[75ch] text-xs text-subtle">{demoCaption(demo)}</p>
      </div>
    </section>
  );
}
