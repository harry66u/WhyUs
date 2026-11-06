import { SWAP_STATUS_LABELS, SwapGlyph, uniquenessLabel } from "@/components/dossier";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { IconCheck } from "@/components/ui/icons";
import { UniquenessMeter } from "@/components/ui/meter";
import { SourceLink } from "@/components/ui/misc";
import { formatDate, kindLabel } from "@/lib/format";
import type { DossierDetail, FactKind, SwapResult, SwapStatus, UniquenessLabel } from "@/lib/types";
import { joinNames } from "./demo-data";
import { SWAP_WORDS } from "./swap-glyph";
import type { ComparedSchool, LandingDemo } from "./types";

const H2 = "text-2xl font-semibold tracking-[-0.03em] text-balance text-fg sm:text-3xl";
const LEAD = "mt-5 max-w-[34rem] text-md text-pretty text-muted";

/** A long quote shortened at a word boundary, marked with an ellipsis as quotations are. */
export function excerpt(text: string, max = 340): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max).replace(/\s+\S*$/, "").replace(/[\s,;:.]+$/, "");
  return `${cut}…`;
}

/* ------------------------------------------------------------------ */
/* Official sources, verified                                          */
/* ------------------------------------------------------------------ */

export function SourcesSpecimen({ demo }: { demo: LandingDemo }) {
  const c = demo.citation;
  const stats = demo.corpusStats;
  const example = demo.source === "example";
  const checkedOn = formatDate(c.verifiedAt);

  return (
    <section aria-labelledby="sources-title" className="border-t border-line">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:py-28">
        <div className="lg:col-span-5">
          <h2 id="sources-title" className={H2}>
            Official sources only, and every fact verified
          </h2>
          <p className={LEAD}>
            WhyUs reads course catalogs, department and faculty pages, labs and centers, student organizations, and special programs on each
            college’s own sites. A fact reaches your dossier only if its quoted text is on the current page, and every citation shows the day it
            was confirmed. If something cannot be verified, it is left out.
          </p>
          {stats ? (
            <p className="mt-5 max-w-[34rem] text-sm text-subtle">
              {stats.term ? `The ${stats.term} research bases hold ` : "The research bases hold "}
              <span className="tabular text-muted">{stats.facts}</span> verified facts from{" "}
              <span className="tabular text-muted">{stats.pages}</span> official pages at {joinNames(stats.schools)}, shared across students and
              refreshed each term.
            </p>
          ) : null}
        </div>

        <figure className="lg:col-span-7">
          <div className="rounded-lg bg-raised px-5 py-6 shadow-raise sm:px-8 sm:py-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <p className="text-xs text-muted">{kindLabel(c.kind)}</p>
              <p className="text-xs text-subtle">
                {demo.school.name}
                {example ? <span className="sr-only">, an example</span> : null}
              </p>
            </div>
            <h3 className="mt-2 font-serif text-xl/[1.3] font-medium tracking-[-0.012em] text-pretty text-fg">{c.title}</h3>
            <blockquote cite={c.sourceUrl} className="mt-5 border-l-2 border-line-strong pl-4 font-serif text-[1.0625rem]/[1.65] text-pretty text-muted">
              <p>
                <span aria-hidden="true">“</span>
                {excerpt(c.quote)}
                <span aria-hidden="true">”</span>
              </p>
            </blockquote>
            <div className="mt-5">
              <span className="sr-only">Source: </span>
              <SourceLink url={c.sourceUrl} verifiedAt={c.verifiedAt} className="max-w-full" />
            </div>

            <div className="mt-7 border-t border-line pt-5">
              <p className="text-xs text-muted">Checked on the live page on {checkedOn}</p>
              <ul role="list" className="mt-3 space-y-2.5 text-sm">
                {c.officialDomain ? (
                  <li className="flex gap-2.5">
                    <IconCheck size={16} className="mt-0.5 shrink-0 text-ok" />
                    <span className="text-muted">
                      On an official {demo.school.shortName} domain, <span className="text-fg">{c.officialDomain}</span>
                    </span>
                  </li>
                ) : null}
                <li className="flex gap-2.5">
                  <IconCheck size={16} className="mt-0.5 shrink-0 text-ok" />
                  <span className="text-muted">The quoted text is on the page, word for word</span>
                </li>
                {c.nameOnPage ? (
                  <li className="flex gap-2.5">
                    <IconCheck size={16} className="mt-0.5 shrink-0 text-ok" />
                    <span className="text-muted">
                      The name appears on the page, <span className="text-fg">{c.nameOnPage}</span>
                    </span>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
          <figcaption className="mt-3 text-xs text-subtle">
            {example
              ? "An example citation from a fictional school."
              : `The top detail from the ${demo.school.shortName} dossier in the replay above, as it appears in the briefing.`}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Swap test                                                           */
/* ------------------------------------------------------------------ */

function resultFor(swap: SwapResult[], school: ComparedSchool): SwapResult {
  return swap.find((r) => r.schoolId === school.schoolId) ?? { schoolId: school.schoolId, schoolName: school.shortName, status: "unknown" };
}

/** One row of the matrix: a dossier detail with its uniqueness, or the verified detail the dossier left out. */
interface MatrixRow {
  factId: string;
  title: string;
  kind: FactKind;
  swap: SwapResult[];
  verdict: { score: number; label: UniquenessLabel } | "left-out";
}

export function matrixModel(demo: Pick<LandingDemo, "dossier" | "leftOut">): MatrixRow[] {
  const details = demo.leftOut ? [...demo.dossier.details].sort((a, b) => a.rank - b.rank).slice(0, 4) : matrixRows(demo.dossier.details);
  const rows: MatrixRow[] = details.map((d) => ({
    factId: d.factId,
    title: d.title,
    kind: d.kind,
    swap: d.swap,
    verdict: { score: Math.round(d.uniqueness.score), label: uniquenessLabel(d) },
  }));
  if (demo.leftOut) rows.push({ ...demo.leftOut, verdict: "left-out" });
  return rows;
}

function Verdict({ row }: { row: MatrixRow }) {
  if (row.verdict === "left-out") return <span className="text-xs text-muted">Not in the dossier</span>;
  const { score, label } = row.verdict;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <UniquenessMeter score={score} size="sm" label={`Uniqueness ${score} out of 100, ${label}`} />
      <span className={label === "Distinctive" ? "text-xs font-medium text-accent-text" : "text-xs text-fg"}>{label}</span>
    </span>
  );
}

function matrixCaption(demo: LandingDemo): string {
  if (demo.source === "example") return "Example data for a fictional school.";
  const base = `From the ${demo.school.shortName} dossier in the replay, against the sample student’s other schools.`;
  if (!demo.leftOut) return base;
  const names = (status: SwapStatus) => demo.leftOut!.swap.filter((r) => r.status === status).map((r) => r.schoolName);
  const verb = (n: string[]) => (n.length === 1 ? "has" : "have");
  const equivalent = names("equivalent");
  const similar = names("similar");
  const parts = [
    equivalent.length ? `${joinNames(equivalent)} ${verb(equivalent)} an equivalent` : null,
    similar.length ? `${joinNames(similar)} ${verb(similar)} something similar` : null,
  ].filter(Boolean);
  return `${base} The last row was verified in the same run but is not in the dossier: ${parts.join(", and ")}.`;
}

/**
 * Rows for the matrix: the top-ranked details, plus the most swappable one if
 * it is not already among them (the contrast is the point), in rank order.
 */
export function matrixRows(details: DossierDetail[], count = 5): DossierDetail[] {
  const ranked = [...details].sort((a, b) => a.rank - b.rank);
  if (ranked.length <= count) return ranked;
  const top = ranked.slice(0, count - 1);
  const equivalents = (d: DossierDetail) => d.swap.filter((r) => r.status === "equivalent").length;
  const rest = ranked.slice(count - 1).sort((a, b) => equivalents(b) - equivalents(a) || a.uniqueness.score - b.uniqueness.score || a.rank - b.rank);
  return [...top, rest[0]].sort((a, b) => a.rank - b.rank);
}

function cellText(r: SwapResult, school: ComparedSchool): string {
  const label = SWAP_STATUS_LABELS[r.status];
  return r.equivalentTitle && (r.status === "equivalent" || r.status === "similar")
    ? `${school.shortName}: ${label}, ${r.equivalentTitle}`
    : `${school.shortName}: ${label}`;
}

const LEGEND: SwapStatus[] = ["equivalent", "similar", "none", "unknown"];

export function SwapTestSpecimen({ demo }: { demo: LandingDemo }) {
  const rows = matrixModel(demo);
  const schools = demo.compared;
  if (rows.length === 0 || schools.length === 0) return null;

  return (
    <section aria-labelledby="swap-title" className="border-t border-line">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:py-28">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-10">
          <h2 id="swap-title" className={`${H2} lg:col-span-5`}>
            The swap test
          </h2>
          <p className="max-w-[38rem] text-md text-pretty text-muted lg:col-span-6 lg:col-start-7">
            If a detail still works after you swap in another college’s name, it will not make your essay specific. WhyUs checks every detail
            against the other schools on your list and ranks the ones they do not have higher. A school without a verified research base shows
            as not researched, never as having nothing.
          </p>
        </div>

        <figure className="mt-12">
          {/* Wide: a matrix of details by schools */}
          <div className="hidden overflow-hidden rounded-lg bg-raised shadow-raise md:block">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Swap test for {demo.school.shortName} details against the other schools on the sample student’s list
              </caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="px-5 py-3 text-xs font-medium text-muted">
                    {demo.school.shortName} detail
                  </th>
                  {schools.map((s) => (
                    <th key={s.schoolId} scope="col" className="px-3 py-3 text-center text-xs font-medium text-muted">
                      {s.shortName}
                    </th>
                  ))}
                  <th scope="col" className="px-5 py-3 text-xs font-medium text-muted">
                    Uniqueness
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.factId} className={row.verdict === "left-out" ? "bg-sunken" : undefined} data-matrix-row={row.verdict === "left-out" ? "left-out" : "dossier"}>
                    <th scope="row" className="max-w-[22rem] px-5 py-4 align-top font-normal">
                      <span className={cn("block font-serif text-base leading-snug text-pretty", row.verdict === "left-out" ? "text-muted" : "text-fg")}>
                        {row.title}
                      </span>
                      <span className="mt-1 block text-2xs text-subtle">{kindLabel(row.kind)}</span>
                    </th>
                    {schools.map((s) => {
                      const r = resultFor(row.swap, s);
                      return (
                        <td key={s.schoolId} className="px-3 py-4 text-center align-middle" title={cellText(r, s)}>
                          <SwapGlyph status={r.status} className="mx-auto h-4 w-4" />
                          <span className="sr-only">{SWAP_STATUS_LABELS[r.status]}</span>
                        </td>
                      );
                    })}
                    <td className="px-5 py-4 align-middle">
                      <Verdict row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Narrow: one block per detail */}
          <ul role="list" className="divide-y divide-line overflow-hidden rounded-lg bg-raised shadow-raise md:hidden">
            {rows.map((row) => (
              <li key={row.factId} className={cn("px-4 py-4", row.verdict === "left-out" && "bg-sunken")}>
                <p className={cn("font-serif text-base leading-snug", row.verdict === "left-out" ? "text-muted" : "text-fg")}>{row.title}</p>
                <p className="mt-0.5 text-2xs text-subtle">{kindLabel(row.kind)}</p>
                <ul role="list" className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 min-[420px]:grid-cols-2" aria-label="Swap test">
                  {schools.map((s) => {
                    const r = resultFor(row.swap, s);
                    return (
                      <li key={s.schoolId} className="flex min-w-0 items-center gap-2 text-xs">
                        <SwapGlyph status={r.status} className="shrink-0" />
                        <span className="min-w-0 truncate text-fg">{s.shortName}</span>
                        <span className="sr-only">: {SWAP_STATUS_LABELS[r.status]}</span>
                        <span className="shrink-0 text-subtle" aria-hidden="true">
                          {SWAP_WORDS[r.status]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3">
                  <Verdict row={row} />
                </p>
              </li>
            ))}
          </ul>

          <figcaption className="mt-4 flex flex-col gap-3 text-xs text-subtle lg:flex-row lg:items-start lg:justify-between lg:gap-10">
            <ul role="list" className="flex shrink-0 flex-wrap gap-x-5 gap-y-2" aria-label="Key">
              {LEGEND.map((status) => (
                <li key={status} className="inline-flex items-center gap-2">
                  <SwapGlyph status={status} className="h-3.5 w-3.5" />
                  <span className="text-muted">{SWAP_STATUS_LABELS[status]}</span>
                </li>
              ))}
            </ul>
            <p className="max-w-[60ch] lg:text-right">{matrixCaption(demo)}</p>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Never writes your essay                                             */
/* ------------------------------------------------------------------ */

function DraftLines({ widths }: { widths: number[] }) {
  return (
    <div aria-hidden="true">
      {widths.map((w, i) => (
        <span key={i} className="flex h-[1.85rem] items-center">
          <span className="block h-2 rounded-full bg-line" style={{ width: `${w}%` }} />
        </span>
      ))}
    </div>
  );
}

export function DraftSpecimen() {
  return (
    <section aria-labelledby="draft-title" className="border-t border-line">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:py-28">
        <div className="lg:order-2 lg:col-span-5 lg:col-start-8">
          <h2 id="draft-title" className={H2}>
            WhyUs never writes or rewrites your essay.
          </h2>
          <p className={LEAD}>
            Paste your own draft and the checker counts words against the limit, confirms each school fact against official pages, runs the swap
            test on your sentences, and highlights the generic ones. It points out problems. The writing stays yours.
          </p>
          <p className="mt-4 max-w-[34rem] text-sm text-subtle">
            Essay angles in a dossier are one-line ideas, and every dossier says plainly that it is research, in line with college policies on AI
            use.
          </p>
        </div>

        <figure className="lg:order-1 lg:col-span-7">
          <div className="rounded-lg bg-raised shadow-raise">
            <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
              <p className="text-xs font-medium text-fg">Draft check</p>
              <p className="text-2xs text-muted">1 generic sentence</p>
            </div>
            <div className="grid gap-6 px-5 py-6 sm:px-7 sm:py-7 md:grid-cols-[minmax(0,1fr)_13rem] md:items-center md:gap-8">
              <div>
                <DraftLines widths={[100, 94, 97]} />
                <p className="font-serif text-[1.0625rem] leading-[1.85rem] text-fg">
                  <mark aria-describedby="draft-note" className="rounded-xs bg-bad-wash px-0.5 text-fg [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
                    I am drawn to the university’s world-class faculty, beautiful campus, and vibrant community.
                  </mark>
                </p>
                <DraftLines widths={[98, 91, 46]} />
                <p className="sr-only">The rest of the draft is not shown.</p>
              </div>
              <aside id="draft-note" className="border-t border-line pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-5">
                <Badge tone="bad">Generic sentence</Badge>
                <p className="mt-2.5 text-sm text-pretty text-muted">
                  “World-class faculty” and “vibrant community” are phrases admissions readers see in many essays. Nothing here is specific to this
                  school.
                </p>
              </aside>
            </div>
          </div>
          <figcaption className="mt-3 text-xs text-subtle">
            An illustration with a made-up sentence. The checker marks what it finds; it never suggests replacement text.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
