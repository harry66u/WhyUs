import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { IconPlus } from "@/components/ui/icons";
import {
  billingConfig,
  COUNSELOR_STUDENTS_WITHOUT_PLAN,
  formatMoney,
  PARENT_MAX_STUDENTS,
  PLAN_TERM_LABEL,
  REFUND_WINDOW_DAYS,
  supportEmail,
  unlimitedBreakEven,
} from "@/lib/billing/plans";

export async function generateMetadata(): Promise<Metadata> {
  const c = billingConfig();
  return {
    title: "Pricing",
    description: `Your first school is free. Then ${formatMoney(c.schoolCents)} per school, or ${formatMoney(c.unlimitedCents)} once for every school on one student's list. The counselor plan covers up to ${c.counselorMaxStudents} students.`,
  };
}

type RowKey = "schools" | "students" | "lasts" | "bestFor";

const ROWS: { key: RowKey; label: string }[] = [
  { key: "schools", label: "Schools" },
  { key: "students", label: "Students" },
  { key: "lasts", label: "How long" },
  { key: "bestFor", label: "Best for" },
];

interface Plan {
  id: string;
  name: string;
  price: string;
  unit: string;
  rows: Record<RowKey, string>;
}

const INCLUDED: { title: string; body: string }[] = [
  {
    title: "Six to eight verified details",
    body: "Taken from official school pages only, each linked to its source and dated the day it was confirmed on the live page.",
  },
  { title: "Why each one fits", body: "One plain sentence connecting the detail to the student's own activities and interests." },
  {
    title: "Uniqueness and the swap test",
    body: "Each detail is rated for how rarely applicants mention it, and checked for an equivalent at the other schools on the list.",
  },
  { title: "Two or three angles", body: "One line each. Ideas to explore, never drafted sentences." },
  { title: "Three questions to ask", body: "Specific questions for an info session or a current student." },
  { title: "A share link and a PDF", body: "Share a read-only copy with a parent or counselor and turn the link off at any time, or export a PDF." },
];

function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group border-b border-line">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-md font-medium text-fg transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
        {question}
        <IconPlus aria-hidden="true" className="mt-1.5 shrink-0 text-subtle transition-transform duration-150 group-open:rotate-45" />
      </summary>
      <div className="max-w-[62ch] space-y-3 pb-6 text-sm leading-relaxed text-muted">{children}</div>
    </details>
  );
}

const linkClass = "text-fg underline decoration-line-strong underline-offset-[3px] transition-colors hover:decoration-accent-line";

export default function PricingPage() {
  const c = billingConfig();
  const price = { school: formatMoney(c.schoolCents), unlimited: formatMoney(c.unlimitedCents), counselor: formatMoney(c.counselorCents) };
  const breakEven = unlimitedBreakEven(c);
  const email = supportEmail();

  const plans: Plan[] = [
    {
      id: "free",
      name: "First school",
      price: "Free",
      unit: "for every account",
      rows: { schools: "One, with the full dossier", students: "Any one student", lasts: "No time limit", bestFor: "Seeing exactly what a dossier gives you" },
    },
    {
      id: "credit",
      name: "School credit",
      price: price.school,
      unit: "per school",
      rows: { schools: "One per credit", students: "Any student on the account", lasts: "Credits never expire", bestFor: "A short list, or one more school" },
    },
    {
      id: "unlimited",
      name: "Unlimited",
      price: price.unlimited,
      unit: "one time, per student",
      rows: {
        schools: "Every school on the list",
        students: "One student",
        lasts: PLAN_TERM_LABEL,
        bestFor: `A full list. From ${breakEven} schools it costs less than credits.`,
      },
    },
    {
      id: "counselor",
      name: "Counselor plan",
      price: price.counselor,
      unit: "one time",
      rows: {
        schools: "Every school, for every student",
        students: `Up to ${c.counselorMaxStudents} students`,
        lasts: PLAN_TERM_LABEL,
        bestFor: "School counselors and college access programs",
      },
    },
  ];

  return (
    <div>
      <section className="mx-auto max-w-[1200px] px-4 pt-16 pb-12 sm:px-6 sm:pt-24 sm:pb-16">
        <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.035em] text-fg sm:text-4xl sm:tracking-[-0.04em] lg:text-5xl">Your first school is free</h1>
        <p className="mt-6 max-w-[34rem] text-md text-muted">
          After that, pay {price.school} per school, or {price.unlimited} once for every school on one student&apos;s list. Counselors can cover up to{" "}
          {c.counselorMaxStudents} students with one plan. One-time payments; nothing renews.
        </p>
      </section>

      <section aria-labelledby="compare-title" className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <h2 id="compare-title" className="sr-only">
          Compare plans
        </h2>

        <div className="hidden overflow-hidden rounded-lg bg-raised shadow-raise md:block">
          <table className="w-full table-fixed text-left">
            <caption className="sr-only">What each plan covers</caption>
            <colgroup>
              <col className="w-[15%]" />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className="border-b border-line">
                <td className="p-6" />
                {plans.map((p) => (
                  <th key={p.id} scope="col" className="border-l border-line p-6 align-top font-normal">
                    <span className="block text-sm font-medium text-fg">{p.name}</span>
                    <span className="tabular mt-4 block text-3xl font-semibold tracking-[-0.03em] text-fg">{p.price}</span>
                    <span className="mt-1 block text-xs text-subtle">{p.unit}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ROWS.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="px-6 py-4 align-top text-sm font-normal text-subtle">
                    {row.label}
                  </th>
                  {plans.map((p) => (
                    <td key={p.id} className="border-l border-line px-6 py-4 align-top text-sm text-fg">
                      {p.rows[row.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-px overflow-hidden rounded-lg bg-line shadow-raise md:hidden">
          {plans.map((p) => (
            <section key={p.id} aria-labelledby={`plan-${p.id}`} className="bg-raised px-5 py-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 id={`plan-${p.id}`} className="text-sm font-medium text-fg">
                  {p.name}
                </h3>
                <p className="flex items-baseline gap-2">
                  <span className="tabular text-2xl font-semibold tracking-[-0.03em] text-fg">{p.price}</span>
                  <span className="text-xs text-subtle">{p.unit}</span>
                </p>
              </div>
              <dl className="mt-4 space-y-2.5">
                {ROWS.map((row) => (
                  <div key={row.key} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 text-sm">
                    <dt className="text-subtle">{row.label}</dt>
                    <dd className="text-fg">{p.rows[row.key]}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-2xl text-sm text-subtle">
            Student accounts have one profile. Parent accounts manage up to {PARENT_MAX_STUDENTS} students. Counselor accounts manage up to{" "}
            {COUNSELOR_STUDENTS_WITHOUT_PLAN} students, or up to {c.counselorMaxStudents} with the counselor plan. Buy credits or a plan from Settings
            once you are signed in; checkout runs on Stripe.
          </p>
          <ButtonLink href="/login" variant="primary" className="shrink-0 self-start">
            Start with a free school
          </ButtonLink>
        </div>
      </section>

      <section aria-labelledby="included-title" className="mx-auto mt-24 max-w-[1200px] px-4 sm:mt-32 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <h2 id="included-title" className="text-2xl font-semibold tracking-[-0.03em] text-fg">
              Every dossier includes
            </h2>
            <p className="mt-3 max-w-md text-sm text-muted">
              The research is the same on every plan. A plan only decides how many schools you can add. The live research view and the draft checker
              come with every school too.
            </p>
          </div>
          <dl className="divide-y divide-line border-y border-line">
            {INCLUDED.map((item) => (
              <div key={item.title} className="grid gap-1.5 py-5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-8">
                <dt className="font-serif text-lg leading-snug text-fg">{item.title}</dt>
                <dd className="text-sm text-muted">{item.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="mx-auto mt-24 max-w-[1200px] px-4 pb-24 sm:mt-32 sm:px-6 sm:pb-32">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <h2 id="faq-title" className="text-2xl font-semibold tracking-[-0.03em] text-fg">
            Questions
          </h2>
          <div className="border-t border-line">
            <Faq question="Does WhyUs write any part of the essay?">
              <p>
                No. WhyUs is a research tool. It finds details on official school pages, confirms each one on the live page, explains how it connects to
                what the student has done, and suggests angles as one-line ideas. The draft checker points out problems in a draft the student wrote
                and never rewrites it.
              </p>
              <p>
                Colleges expect the essay to be the applicant&apos;s own work, and many publish policies on AI use in applications. Read the policy of
                each school on the list; using WhyUs is like taking notes on a campus visit.
              </p>
            </Faq>
            <Faq question="What counts as one school?">
              <p>
                One school and the college you apply to within it. Applying to two colleges at the same university counts as two schools. Removing a
                school returns its credit; the free school does not come back once you have bought credits.
              </p>
            </Faq>
            <Faq question="How does the counselor plan work?">
              <p>
                One counselor account manages up to {c.counselorMaxStudents} students for {PLAN_TERM_LABEL}, with every school included. Each student has a
                private profile, list of schools, and dossiers. Need more students? A second plan adds {c.counselorMaxStudents} more.
              </p>
            </Faq>
            <Faq question="What happens to student data?">
              <p>
                It stays private to the account that created it, is never used to train any model, and can be deleted completely at any time from
                Settings. Read the{" "}
                <Link href="/privacy" className={linkClass}>
                  privacy policy
                </Link>{" "}
                for the details.
              </p>
            </Faq>
            <Faq question="Can I get a refund?">
              <p>
                Yes. {email ? <>Email <a href={`mailto:${email}`} className={linkClass}>{email}</a></> : "Contact us"} within {REFUND_WINDOW_DAYS}{" "}
                days of a purchase and it is refunded in full to the original payment method. Refunded credits and plans stop applying to new schools;
                dossiers already in the account stay.
              </p>
            </Faq>
          </div>
        </div>
      </section>
    </div>
  );
}
