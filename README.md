# WhyUs

WhyUs helps high school seniors research their "Why this college?" supplemental
essays. It reads official school sources only, confirms every fact on a current
official page, matches the uncommon details to what the student has actually
done, and produces a one-page research dossier per school. **It never writes the
essay.**

- Live research view: watch official pages being read, facts verified, and matches found.
- Dossier per school: 6-8 cited details (why each fits you, uniqueness rating, swap test
  against your other schools), 2-3 one-line essay angles, 3 questions to ask, PDF export,
  share link.
- Draft checker: word count, claim verification, swap test, generic sentences. Points out
  problems; never rewrites.
- Accounts with email sign-in; first school free, then $9 per school or $29 unlimited;
  counselor plan for many students. Student data is private, never used for training,
  and fully deletable.

## Quick start

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Open http://localhost:3000. Without an email provider, development sign-in shows
the one-time link on the sign-in page and in the server log.

The embedded database (PGlite) lives in `.data/pglite` and is migrated on first use.
Set `DATABASE_URL` to use Postgres instead.

## Configuration

See `.env.example`. Everything is optional in development:

| Variable | Enables |
|---|---|
| `ANTHROPIC_API_KEY` | Live crawling and fact extraction for schools without a research base, natural-language explanations, angles and questions, PDF activity parsing, and reading official pages that block ordinary bots through Claude's web fetch tool. Uses `claude-opus-5-5` (override with `WHYUS_MODEL`). Without it, the deterministic engine runs. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sign-in emails. Required in production. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments. Without them, development builds offer a simulated checkout. |
| `APP_URL` | Absolute URL for sign-in links, share links, and Stripe redirects. Required in production. |
| `SUPPORT_EMAIL` | Contact address shown on the pricing and privacy pages (refunds, privacy requests). Hidden when unset. |
| `PRICE_*_CENTS`, `COUNSELOR_MAX_STUDENTS` | Plan prices and counselor seats (defaults: $9 per school, $29 unlimited, $199 counselor plan for 25 students). |
| `DATABASE_URL` | Postgres in production. |
| `WHYUS_BOT_UA` | How the research bot identifies itself to school web servers (add a contact URL). |

## How research works

1. Each school has a shared research base (`data/corpus/<school>.json`, loaded into the
   database): facts from official course catalogs, department and faculty pages, labs and
   centers, student organization directories, special programs, traditions, and
   location-based opportunities. Each fact stores the official URL and a verbatim quote.
2. A research run ranks the base against the student, then reads each candidate's source
   page live. A fact is kept only if the current page contains its quote and name.
   Verification dates are shown on every citation and written back to the shared base.
3. The matching engine selects 6-8 details, explains each connection in one sentence, runs
   the swap test against the student's other schools, scores uniqueness, proposes angles,
   and keeps lead angles distinct across the student's schools.
4. Research bases are refreshed each term: `npx tsx scripts/refresh-corpus.ts`.

The research bot identifies itself honestly, respects robots.txt, rate-limits per host,
and uses standard TLS validation. It never tries to get past bot challenges; pages it
cannot read are reported in the live view and left out.

## Plans

First school free per account; then $9 per school (credits never expire) or $29 for unlimited
schools for one student for 12 months; the counselor plan covers up to 25 students with unlimited
schools for 12 months. The exact rules are documented at the top of `src/lib/billing/rules.ts`;
prices, seat counts, the 12-month term, and the 14-day refund window are constants in
`src/lib/billing/plans.ts`.

## Scripts

```bash
npm test                       # unit tests (Vitest)
npm run typecheck
npm run lint
npm run done-check             # acceptance check: 5 dossiers for the sample student
npx tsx scripts/fetch-text.ts <url> --school <id>     # read an official page as WhyUs sees it
npx tsx scripts/verify-facts.ts <school> --write      # lint + live-verify a research base
npx tsx scripts/sitemap.ts https://<host>/ --grep lab # discover official pages
```

## Project layout

See `docs/ARCHITECTURE.md` (modules and contracts), `docs/DESIGN.md` (design system),
`docs/research/AGENT_GUIDE.md` (how research bases are built), and `docs/SPEC.md` (the brief).

## Deployment notes

- Runs as a Node.js server (`npm run build && npm start`). Research runs execute
  in-process in the background, so use a long-lived Node host (or a serverless platform
  with long function durations).
- Use Postgres (`DATABASE_URL`) in production; PGlite is for local development.
- Configure the Stripe webhook at `/api/stripe/webhook` for `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, and `charge.refunded`. The route answers 503
  until `STRIPE_WEBHOOK_SECRET` is set.
- Build with `WHYUS_DISABLE_LLM=1` if `ANTHROPIC_API_KEY` is present at build time and you want the
  landing page demo (computed while prerendering from the verified research bases) to stay
  deterministic.
