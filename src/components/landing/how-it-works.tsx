import { cn } from "@/components/ui/cn";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Build your profile",
    body: "Add your intended major, interests, and activities. Paste them in, or upload your Common App activities or a resume as a PDF.",
  },
  {
    title: "Add schools and prompts",
    body: "Choose each school and the college inside it you are applying to, then pick the exact supplemental prompt or paste your own with its word limit.",
  },
  {
    title: "Watch the research",
    body: "WhyUs reads official pages, confirms each fact on the current page, matches what it finds to your activities, and runs the swap test. About two minutes per school.",
  },
  {
    title: "Use your dossier",
    body: "One page per school: 6 to 8 cited details, a uniqueness score, two or three one-line angles, and three questions to ask. Share a link or export a PDF.",
  },
];

/** The four steps from profile to dossier. A real sequence, so the steps are numbered. */
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:py-28">
        <h2 id="how-title" className="text-2xl font-semibold tracking-[-0.03em] text-fg sm:text-3xl">
          How it works
        </h2>
        <p className="mt-4 max-w-[38rem] text-md text-pretty text-muted">
          From your activity list to a one-page briefing for every school on your list, each one ready in about two minutes.
        </p>

        <ol className="mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative min-w-0">
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium tabular text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]">
                  {i + 1}
                </span>
                <span className={cn("h-px flex-1 bg-line", i === STEPS.length - 1 && "lg:invisible", "max-lg:hidden")} />
              </div>
              <h3 className="mt-5 text-md font-semibold tracking-[-0.01em] text-fg">{step.title}</h3>
              <p className="mt-2 max-w-[34ch] text-sm text-pretty text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
