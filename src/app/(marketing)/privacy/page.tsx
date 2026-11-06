import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";
import { supportEmail } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Student data on WhyUs stays private to the account that created it, is never used to train any model, and can be deleted completely at any time.",
};

/** Change this date whenever the policy text changes. */
const UPDATED = "2026-11-06";

const SECTIONS = [
  { id: "stored", title: "What WhyUs stores, and why" },
  { id: "access", title: "Who can see it" },
  { id: "training", title: "Never used to train any model" },
  { id: "services", title: "Services that handle data for WhyUs" },
  { id: "deleting", title: "Deleting your data" },
  { id: "research", title: "School research is shared" },
  { id: "cookies", title: "Cookies" },
  { id: "contact", title: "Contact" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const title = SECTIONS.find((s) => s.id === id)?.title ?? id;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-line pt-10">
      <h2 id={`${id}-title`} className="text-xl font-semibold tracking-[-0.025em] text-fg">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-base leading-relaxed text-muted">{children}</div>
    </section>
  );
}

const STORED: { what: string; detail: string; why: string }[] = [
  { what: "Account", detail: "Email address, your name, and account type (student, parent, or counselor).", why: "To sign you in and run the account." },
  {
    what: "Sign-in",
    detail: "One-time sign-in links and session tokens, stored only as one-way hashes. Links expire after 20 minutes and work once.",
    why: "To keep you signed in safely.",
  },
  {
    what: "Student profiles",
    detail:
      "Name, class year, high school and hometown if given, intended majors, interests, activities, and any activities text pasted in or read from an uploaded PDF. The PDF itself is not kept.",
    why: "To match each school's details to what the student has actually done.",
  },
  { what: "Schools", detail: "Each school on a list, the college within it, the essay prompt, and the word limit.", why: "To scope the research to that prompt." },
  {
    what: "Research and dossiers",
    detail: "Each research run (which official pages were read and which facts were confirmed), each dossier, and any share links you create.",
    why: "So you can come back to them, export them, and share them.",
  },
  {
    what: "Purchases",
    detail: "What was bought, the amount, the date, and Stripe's reference for the checkout. Card details go to Stripe and never reach WhyUs.",
    why: "To apply your plan and answer billing questions.",
  },
];

const linkClass = "text-fg underline decoration-line-strong underline-offset-[3px] transition-colors hover:decoration-accent-line";

export default function PrivacyPage() {
  const email = supportEmail();
  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-16 pb-24 sm:px-6 sm:pt-24 sm:pb-32">
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-28">
            <p className="text-xs text-subtle">On this page</p>
            <ul className="mt-3 space-y-2 border-l border-line">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px block border-l border-transparent pl-4 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <article className="min-w-0 max-w-[44rem]">
          <header>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-fg">Privacy</h1>
            <p className="mt-4 text-sm text-subtle">
              Plain-language policy. Last updated <time dateTime={UPDATED}>{formatDate(UPDATED)}</time>.
            </p>
          </header>

          <section aria-labelledby="short-title" className="mt-12">
            <h2 id="short-title" className="text-sm font-medium text-fg">
              The short version
            </h2>
            <ul className="mt-4 divide-y divide-line border-y border-line font-serif text-lg leading-snug text-fg">
              <li className="py-4">Student data stays private to the account that created it.</li>
              <li className="py-4">It is never used to train any model: not by WhyUs, and not by Anthropic, whose API terms do not allow it.</li>
              <li className="py-4">You can download it, and delete all of it, at any time. Deletion is immediate and complete.</li>
              <li className="py-4">The school research WhyUs shares across students contains no student data.</li>
            </ul>
          </section>

          <div className="mt-14 space-y-14">
            <Section id="stored">
              <p>WhyUs keeps only what the research needs, and nothing for advertising or analytics.</p>
              <dl className="divide-y divide-line border-y border-line">
                {STORED.map((row) => (
                  <div key={row.what} className="grid gap-1.5 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
                    <dt className="text-sm font-medium text-fg">{row.what}</dt>
                    <dd className="text-sm">
                      <p>{row.detail}</p>
                      <p className="mt-1 text-subtle">{row.why}</p>
                    </dd>
                  </div>
                ))}
              </dl>
              <p>Draft text pasted into the draft checker is checked when you ask and is not stored by WhyUs.</p>
            </Section>

            <Section id="access">
              <p>
                Only the account that created the data, signed in. Every query in WhyUs is scoped to the signed-in account, so one account cannot read
                another&apos;s students, schools, or dossiers.
              </p>
              <p>
                Parents and counselors own the student profiles they create. If a parent or counselor set up your profile, it belongs to their account:
                they can see it, and they can delete it.
              </p>
              <p>
                Share links are off until you create one. Anyone with a link can read that one dossier, including how each detail connects to the
                student&apos;s activities; it never shows the account&apos;s email address or the student&apos;s name, and search engines are asked not to
                index it. Turn the link off and it stops working at once. Removing the school, deleting the student, or deleting the account deletes its
                links too.
              </p>
            </Section>

            <Section id="training">
              <p>
                WhyUs does not train, fine-tune, or evaluate any model on student data, and it does not sell or share student data with anyone for
                that purpose.
              </p>
              <p>
                Some steps use Anthropic&apos;s Claude API: reading an uploaded activities list, wording the fit sentences, angles, and questions in a
                dossier, and finding the school references in a draft for the draft checker. For each step WhyUs sends only what that step needs.
                WhyUs uses the Claude API under Anthropic&apos;s commercial terms, which do not allow Anthropic to use customer data sent through the
                API to train its models.
              </p>
            </Section>

            <Section id="services">
              <p>WhyUs works with a small number of services, each for one job:</p>
              <ul className="list-disc space-y-2 pl-5 marker:text-subtle">
                <li>
                  <span className="text-fg">Anthropic</span> (Claude API) for the steps described above.
                </li>
                <li>
                  <span className="text-fg">Stripe</span> for payments. Stripe receives the account email address and what is being bought, never
                  student profiles or dossiers.
                </li>
                <li>
                  <span className="text-fg">Resend</span> to deliver sign-in emails. It receives the email address and the one-time link.
                </li>
              </ul>
              <p>The school pages WhyUs reads are public official pages. Reading them sends nothing about any student to the school.</p>
            </Section>

            <Section id="deleting">
              <p>Everything can be deleted by the account that owns it, at any time, without asking anyone:</p>
              <ul className="list-disc space-y-2 pl-5 marker:text-subtle">
                <li>
                  <span className="text-fg">Delete your account</span> in{" "}
                  <Link href="/app/settings#privacy" className={linkClass}>
                    Settings
                  </Link>
                  : the account and every student profile, school, research run, dossier, share link, and purchase record are deleted immediately and
                  permanently, and you are signed out.
                </li>
                <li>
                  <span className="text-fg">Delete one student</span> (parents and counselors) from Students: their profile, schools, dossiers, and
                  share links are deleted.
                </li>
                <li>
                  <span className="text-fg">Remove a school</span> from the dashboard: its research, dossier, and share links are deleted.
                </li>
                <li>
                  <span className="text-fg">Turn off a share link</span>: it stops working at once.
                </li>
              </ul>
              <p>
                There is no waiting period and no hidden copy kept in WhyUs. To keep a copy, use Download my data in Settings first: it gives you a
                JSON file of everything listed above. Stripe keeps its own record of payments, as payment providers must; deleting a WhyUs account
                does not remove Stripe&apos;s record.
              </p>
            </Section>

            <Section id="research">
              <p>
                The research behind each dossier, meaning the official pages WhyUs reads and the facts it confirms on them, is shared across all
                students and refreshed each term, so results come back fast. It contains no student data: no names, profiles, prompts, drafts, or
                record of which student looked at which school. Deleting an account leaves it in place because nothing in it belongs to the account.
              </p>
            </Section>

            <Section id="cookies">
              <p>WhyUs uses only the cookies it needs to work, and no analytics, advertising, or tracking cookies:</p>
              <ul className="list-disc space-y-2 pl-5 marker:text-subtle">
                <li>
                  <span className="text-fg">Session cookie</span>: keeps you signed in for up to 30 days. It holds a random token that the server
                  stores only as a hash. Signing out or deleting your account ends it.
                </li>
                <li>
                  <span className="text-fg">Active student cookie</span>: remembers which student profile is open, so parents and counselors come
                  back to the student they were working on.
                </li>
              </ul>
              <p>
                Your light or dark theme choice is saved in your browser&apos;s local storage and never sent to WhyUs. Stripe&apos;s checkout pages set
                their own cookies when you pay.
              </p>
            </Section>

            <Section id="contact">
              {email ? (
                <p>
                  Questions or requests about privacy:{" "}
                  <a href={`mailto:${email}`} className={linkClass}>
                    {email}
                  </a>
                  .
                </p>
              ) : null}
              <p>
                You can see, download, and delete everything yourself from{" "}
                <Link href="/app/settings#privacy" className={linkClass}>
                  Settings
                </Link>
                {email ? "; no request is needed." : ", without sending a request."} If this policy changes, the date at the top changes with it.
              </p>
            </Section>
          </div>
        </article>
      </div>
    </div>
  );
}
