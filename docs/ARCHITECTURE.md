# WhyUs architecture

WhyUs researches each college on a student's list from official sources only,
verifies every fact on a current official page, matches the uncommon details to
the student's real activities, and produces a one-page dossier per school. It
never writes the essay.

## Stack

- Next.js 16 (App Router, Turbopack, `src/proxy.ts` instead of middleware), React 19, TypeScript 6.
  **Next 16 differs from older versions.** Before using any Next API, read the bundled
  docs in `node_modules/next/dist/docs/` (request APIs are async: `await cookies()`,
  `await headers()`, `await props.params`, `await props.searchParams`).
- Tailwind CSS v4 with tokens in `src/app/globals.css` (see `docs/DESIGN.md`).
- Drizzle ORM on Postgres. Locally an embedded PGlite database in `.data/pglite`;
  tests use in-memory PGlite (`WHYUS_DB=memory`). Schema: `src/lib/db/schema.ts`.
- Claude via `@anthropic-ai/sdk` (`src/lib/llm/client.ts`), optional. Every feature has a
  deterministic path that works without `ANTHROPIC_API_KEY` (this environment has none).
- Stripe for payments, Resend HTTP API for sign-in email, `@react-pdf/renderer` for PDF,
  `unpdf` for reading PDFs, `cheerio` for HTML, `motion` for animation.

## Directory map

```
src/lib/types.ts            shared domain contracts (Fact, Dossier, ResearchEvent, ...)
src/lib/db/                 schema + client (getDb)
src/lib/auth/               magic-link sign-in, sessions (getCurrentUser, requireUser)
src/lib/data/               owner-scoped data access (students, applications, dossiers, users)
src/lib/schools/registry.ts schools, units, prompts, official-domain checks
src/lib/research/           fetcher, robots, extraction, verification, page cache, corpus store, runner
src/lib/matching/           themes taxonomy + matching engine (rank, swap test, uniqueness, angles)
src/lib/billing/            plans, entitlements, Stripe
src/lib/draft/              draft checker
src/lib/profile/            activity parsing (text, PDF)
src/lib/pdf/                dossier PDF
src/lib/llm/client.ts       Claude wrapper (generateStructured, llmAvailable)
src/components/ui/          design-system primitives (Button, Field, Badge, meters, icons, ...)
data/schools/*.json         school registry (domains, units, 2026-27 prompts, seed URLs)
data/corpus/*.json          verified seed corpora (one per school, current term)
data/sample-student.json    the sample student used by the done check and demos
scripts/                    fetch-text, sitemap, verify-facts, done-check, ...
```

## Core flow

1. **Profile**: intended majors, interests, activities (typed, pasted, or parsed from an
   uploaded Common App activities PDF or resume). Parents and counselors manage several
   students; the active student is chosen in the sidebar switcher.
2. **Schools**: the student adds a school, picks the unit (e.g. Cornell Engineering), and
   picks the prompt from the library (`data/schools/<id>.json` -> `prompts`) or pastes a
   custom prompt and word limit. Creating an application checks entitlements and starts research.
3. **Research run** (per application, in-process background job, events persisted):
   `scope -> discover -> read -> verify -> match -> swap -> assemble`.
   - scope: school + unit from the application (custom prompts: `findUnitsInText`).
   - discover: load the school's shared research base (`getSchoolFacts`). Schools without a
     base are crawled and extracted with Claude when available.
   - read + verify: preliminary ranking (`rankFacts`) picks candidates; each candidate's
     official source page is read live (`DbPageSource`) and the fact is kept only if the page
     currently contains its quote and name (`verifyAgainstPage`). Results are recorded on the
     shared corpus (`recordVerification`) so the next student benefits.
   - match, swap, assemble: `buildDossier` (matching engine).
   - afterwards: `coordinateAngles` across the student's dossiers so no two lead with the same angle.
4. **Dossier**: 6-8 details (source link, why it fits, uniqueness), 2-3 one-line angles,
   3 questions, the research-use note; share link and PDF export.
5. **Draft checker** (optional): word count, claim verification, swap test, generic sentences.
   Points out problems; never rewrites.

## Rules that every module must keep

- **Official sources only.** Use `isOfficialUrl(url, school)`; never cite anything else.
- **Every fact is confirmed on a current page** before it appears in a dossier, with the
  verification date shown. If a fact cannot be confirmed now (page gone, quote missing,
  host unreachable), it is left out. Never invent courses, professors, labs, or clubs.
- **Never write the essay.** No drafted prose, no rewrites, no "suggested sentences".
  Angles are one-line ideas. The draft checker only points out problems.
- **Never bypass bot protections or weaken TLS.** Blocked hosts are reported as blocked.
- **Student data is private.** Every query is scoped to the owning account
  (`src/lib/data/*` take the user id). Shared research data contains no student data.
- **No new npm dependencies and no schema changes** without the integrator: report the need
  in your summary instead. Do not run `next build`, `next dev`, or `npm install` (they
  conflict with other modules being built in parallel). Use `npx tsc --noEmit` and
  `npx vitest run <your tests>`.

## Module contracts

Stubs with these exact signatures exist; implement them in place.

### research runtime
- `src/lib/research/runner.ts`: `startResearch(applicationId, {force?})`, `getLatestRun(applicationId)`,
  `getRunEvents(runId, afterSeq)`. Runs execute in-process (guard against duplicate runs with a
  global map); events go to `research_events`; application `status`/`progress` are updated as stages
  complete. A run must finish within about two minutes per school.
- Candidate selection: rank all school facts with `rankFacts`, verify the best candidates live
  (dedupe source pages; concurrency about 6), continue down the ranking until at least 10 facts are
  verified or candidates run out; keep kind diversity.
- SSE endpoint streams stored events (replay from `Last-Event-ID` / `?after=`), then new ones.
- Live view `/app/schools/[applicationId]/research` (the product's signature moment).
- With Claude: crawl and extract new facts (structured outputs, quotes verified by
  `verifyAgainstPage` before storage) for schools without a corpus, and an optional fallback that
  reads blocked official pages through Claude's web fetch tool. Both must be off without a key.

### matching engine
- `rankFacts(student, facts, {unitId, promptText, limit})`: pure, deterministic, fast. Scores how
  directly each fact connects to the student's actual activities (weighted by theme specificity,
  activity depth, unit fit, prompt fit) and down-weights commonly mentioned details.
- `buildDossier(input, {emit})`: from `input.verifiedFacts` only, select 6-8 details (diverse kinds,
  uncommon first, unit-scoped), write one plain fit sentence per detail grounded in the student's
  real activity and the fact's quote, run the swap test against `input.otherSchools` (verified facts
  only; status `unknown` when a school has no research base), compute per-detail uniqueness
  (label: Distinctive / Uncommon / Typical / Commonly mentioned) and the dossier score (0-100),
  propose 2-3 angles (one line, idea only) whose lead avoids `input.usedLeadAngleKeys`, and pick
  3 specific questions (info session / current student). Emit `match`, `swap`, `angle` events.
- Angle key: `<primaryActivityId>|<primaryThemeKey>`. Leads across one student's dossiers must
  differ in key, and should differ in primary activity and primary theme where possible.
- `coordinateAngles(dossiers)`: re-assign leads across a student's dossiers to satisfy the rule
  above (maximize total fit); returns changed dossiers.
- Also export helpers the draft checker reuses (e.g. `swapTest(fact, otherSchools)`).

### dossier experience
Dossier page `/app/schools/[applicationId]` (redirects to `/research` until ready), public shared
page `/d/[token]` (noindex, read-only, shows no account data), share link API (create/revoke),
PDF export API using `renderDossierPdf` (`src/lib/pdf/dossier-pdf.tsx`) that looks as good as the
screen. Briefing components in `src/components/dossier/` are reused by the landing demo.

### app core
Onboarding (account type: student / parent / counselor; first student profile), dashboard
`/app` (all schools with status, uniqueness, progress, lead angle; progressive updates),
add-school flow `/app/schools/new`, profile builder `/app/profile` (paste text or upload PDF ->
`parseActivitiesText` / `extractPdfText` -> review and edit), students management `/app/students`.

### billing and account
`src/lib/billing/*` (first school free per account, $9 per school credit, $29 unlimited for one
student, counselor plan covering up to `COUNSELOR_MAX_STUDENTS` students; prices from env),
Stripe Checkout + webhook (idempotent), development-only simulated checkout when Stripe keys are
absent, pricing page, settings (account, plan, theme, privacy: export data as JSON, delete account
completely), privacy page.

### draft checker
`checkDraft()` + `/app/draft` (choose one of the student's schools) and `/app/draft/[applicationId]`.

### landing
`/` sells the product in seconds: clear headline, an animated demo of a dossier being built from
real verified corpus data, the differentiators (verified official sources, swap test, never writes
your essay), how it works, pricing summary, privacy promise.
