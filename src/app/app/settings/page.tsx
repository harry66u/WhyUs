import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { IconChevronRight, IconDownload } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { type BillingOverview, getBillingOverview } from "@/lib/billing/overview";
import { ACCOUNT_TYPE_LABELS, billingConfig, COUNSELOR_STUDENTS_WITHOUT_PLAN, PARENT_MAX_STUDENTS } from "@/lib/billing/plans";
import type { PurchaseStatus } from "@/lib/billing/rules";
import { stripeConfigured, syncCheckoutSession } from "@/lib/billing/stripe";
import { plural } from "@/lib/format";
import type { AccountRole, PurchaseKind } from "@/lib/types";
import { AccountNameForm } from "./account-form";
import { DeleteAccount } from "./delete-account";
import { PlanPurchase } from "./plan-purchase";
import { SettingsRow, SettingsSection } from "./section";
import { ThemeSetting } from "./theme-setting";

export const metadata: Metadata = { title: "Settings" };

type SearchParams = { checkout?: string | string[]; session_id?: string | string[]; delete?: string | string[] };

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

const ROLE_HINTS: Record<AccountRole, string> = {
  student: "One profile, your own.",
  parent: `Manage up to ${PARENT_MAX_STUDENTS} students, each with a private profile and list.`,
  counselor: `Manage up to ${COUNSELOR_STUDENTS_WITHOUT_PLAN} students, or more with the counselor plan.`,
};

function addedLine(kind: PurchaseKind, quantity: number): string {
  if (kind === "school_credit") return `${plural(quantity, "school credit")} added to your account.`;
  if (kind === "unlimited") return "Unlimited schools are on for that student.";
  return "Your counselor plan is on.";
}

/** After Stripe Checkout: record the purchase now (idempotent with the webhook) and say what happened. */
async function checkoutNotice(userId: string, sessionId: string | undefined): Promise<string> {
  const later = "Payment received. It can take a minute to show up here; refresh this page to check.";
  if (!sessionId || !stripeConfigured()) return later;
  try {
    const result = await syncCheckoutSession(userId, sessionId, billingConfig());
    if (result.status === "recorded") return `Payment received. ${addedLine(result.purchase.kind, result.purchase.quantity)}`;
  } catch (err) {
    console.error("[billing] could not confirm the Checkout Session on return", err);
  }
  return later;
}

const STATUS_BADGES: Record<PurchaseStatus, { label: string; tone: "ok" | "neutral" | "outline" }> = {
  paid: { label: "Paid", tone: "ok" },
  refunded: { label: "Refunded", tone: "neutral" },
  simulated: { label: "Simulated", tone: "outline" },
};

function PlanSummary({ o }: { o: BillingOverview }) {
  const self = o.role === "student" ? (o.students.find((s) => s.isSelf) ?? o.students[0]) : undefined;
  const credits =
    o.credits.purchased === 0
      ? "None bought"
      : o.credits.left > 0
        ? `${o.credits.left} left of ${o.credits.purchased}`
        : `All ${o.credits.purchased} in use`;
  return (
    <dl className="divide-y divide-line border-y border-line">
      <SettingsRow label="First school" hint={o.freeSchool.available ? "Every account's first school is free." : undefined}>
        {o.freeSchool.available ? "Free, not used yet" : o.freeSchool.usedFor ? `Used for ${o.freeSchool.usedFor}` : "Used"}
      </SettingsRow>
      <SettingsRow label="School credits">
        <span className="tabular">{credits}</span>
      </SettingsRow>
      {o.role === "student" ? (
        <SettingsRow label="Unlimited">
          {self?.unlimitedEndsAt ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge tone="ok">Active</Badge>
              <span className="tabular">Until {self.unlimitedEndsAt}</span>
            </span>
          ) : self?.unlimitedEndedAt ? (
            `Ended ${self.unlimitedEndedAt}`
          ) : (
            "Not active"
          )}
        </SettingsRow>
      ) : null}
      {o.role === "counselor" ? (
        <SettingsRow
          label="Counselor plan"
          hint={o.counselorPlan.active ? undefined : `Without it, a counselor account manages up to ${COUNSELOR_STUDENTS_WITHOUT_PLAN} students.`}
        >
          {o.counselorPlan.active ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge tone="ok">Active</Badge>
              <span className="tabular">
                Until {o.counselorPlan.endsAt}, up to {o.counselorPlan.maxStudents} students
              </span>
            </span>
          ) : o.counselorPlan.endedAt ? (
            `Ended ${o.counselorPlan.endedAt}`
          ) : (
            "Not active"
          )}
        </SettingsRow>
      ) : null}
      {o.role !== "student" ? (
        <SettingsRow label="Students" hint={<span className="tabular">{`${o.students.length} of ${o.studentLimit} on this account`}</span>}>
          {o.students.length === 0 ? (
            <span className="text-muted">None yet</span>
          ) : (
            <ul className="space-y-1.5">
              {o.students.map((s) => (
                <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <span className="min-w-0 truncate">{s.name}</span>
                  <span className="tabular text-xs text-muted">
                    {`${plural(s.schools, "school")}, `}
                    {o.counselorPlan.active ? "counselor plan" : s.unlimitedEndsAt ? `unlimited until ${s.unlimitedEndsAt}` : "no plan"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SettingsRow>
      ) : null}
    </dl>
  );
}

export default async function SettingsPage(props: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("/app/settings");
  const sp = await props.searchParams;
  const notice = one(sp.checkout) === "success" ? await checkoutNotice(user.id, one(sp.session_id)) : null;
  const o = await getBillingOverview(user.id);
  const manages = o.role === "parent" || o.role === "counselor";
  const deleteError =
    one(sp.delete) === "mismatch"
      ? "The email address you typed did not match. Nothing was deleted."
      : one(sp.delete) === "failed"
        ? "Your account could not be deleted just now. Try again in a moment."
        : null;

  const what = manages
    ? `${plural(o.students.length, "student profile")}, ${plural(o.schools, "school")}`
    : `your profile, ${plural(o.schools, "school")}`;
  const deleteSummary = `This permanently deletes your account, ${what}, every dossier and share link, and your purchase records. Credits and plans end with it.`;

  return (
    <div>
      <PageHeader title="Settings" description="Your account, plan, appearance, and data." />

      <SettingsSection id="account" title="Account" description="How you sign in and who this account is for.">
        <AccountNameForm initialName={user.name ?? ""} />
        <dl className="mt-8 divide-y divide-line border-y border-line">
          <SettingsRow label="Email" hint="Sign-in links are sent here. Each works once.">
            <span className="break-all">{user.email}</span>
          </SettingsRow>
          <SettingsRow label="Account type" hint={user.role ? ROLE_HINTS[user.role] : undefined}>
            {user.role ? ACCOUNT_TYPE_LABELS[user.role] : "Not chosen yet"}
          </SettingsRow>
        </dl>
        <form action="/auth/logout" method="post" className="mt-6">
          <Button type="submit" variant="secondary" size="sm">
            Sign out
          </Button>
        </form>
      </SettingsSection>

      <SettingsSection
        id="plan"
        title="Plan"
        description={
          <>
            Your first school is free. After that, pay per school or once for unlimited.{" "}
            <Link href="/pricing" className="text-fg underline decoration-line-strong underline-offset-[3px] hover:decoration-accent-line">
              Compare plans
            </Link>
          </>
        }
      >
        {notice ? (
          <p className="mb-6 rounded-md bg-ok-wash px-3.5 py-2.5 text-sm text-fg" role="status">
            {notice}
          </p>
        ) : null}
        <PlanSummary o={o} />
        <div className="mt-8">
          <PlanPurchase
            payments={o.payments}
            role={o.role}
            prices={o.prices}
            counselorMaxStudents={o.config.counselorMaxStudents}
            maxCredits={o.maxCreditsPerPurchase}
            schoolCredit={o.buy.schoolCredit}
            counselor={{ ...o.buy.counselor, active: o.counselorPlan.active, endsAt: o.counselorPlan.endsAt }}
            students={o.students.map((s) => ({
              id: s.id,
              name: s.name,
              isSelf: s.isSelf,
              unlimited: s.unlimited,
              unlimitedEndsAt: s.unlimitedEndsAt,
            }))}
          />
        </div>
        <details className="group mt-6">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-xs text-sm text-muted transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
            <IconChevronRight size={14} className="text-subtle transition-transform duration-150 group-open:rotate-90" />
            How schools are counted
          </summary>
          <ul className="mt-3 max-w-2xl space-y-2 border-l border-line pl-4 text-sm text-muted">
            {o.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </details>
      </SettingsSection>

      <SettingsSection id="purchases" title="Purchases" description="Payments are processed by Stripe. Refunded purchases stop applying to new schools.">
        {o.purchases.length === 0 ? (
          <p className="text-sm text-muted">No purchases yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Purchase history</caption>
            <thead>
              <tr className="border-b border-line text-2xs text-subtle">
                <th scope="col" className="hidden py-2 pr-4 font-normal sm:table-cell">
                  Date
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Purchase
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  Amount
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {o.purchases.map((p) => (
                <tr key={p.id}>
                  <td className="tabular hidden py-3 pr-4 whitespace-nowrap text-muted sm:table-cell">{p.date}</td>
                  <td className="py-3 pr-4 text-fg">
                    {p.title}
                    <span className="tabular block text-xs text-subtle sm:hidden">{p.date}</span>
                  </td>
                  <td className="tabular py-3 pr-4 text-right text-muted">{p.amount}</td>
                  <td className="py-3 text-right">
                    <Badge tone={STATUS_BADGES[p.status].tone}>{STATUS_BADGES[p.status].label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SettingsSection>

      <SettingsSection id="appearance" title="Appearance" description="Dark is the default.">
        <ThemeSetting />
      </SettingsSection>

      <SettingsSection
        id="privacy"
        title="Privacy and data"
        description={
          <>
            Everything here is private to this account and never used to train any model.{" "}
            <Link href="/privacy" className="text-fg underline decoration-line-strong underline-offset-[3px] hover:decoration-accent-line">
              Privacy policy
            </Link>
          </>
        }
      >
        <div className="divide-y divide-line border-y border-line">
          <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
            <div className="max-w-md">
              <h3 className="text-sm font-medium text-fg">Download your data</h3>
              <p className="mt-1 text-sm text-muted">A JSON file with your account, student profiles, schools, dossiers, and purchases.</p>
            </div>
            <a href="/api/account/export" download className={buttonClasses({ variant: "secondary", className: "shrink-0 self-start sm:self-auto" })}>
              <IconDownload />
              Download my data
            </a>
          </div>

          {manages ? (
            <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              <div className="max-w-md">
                <h3 className="text-sm font-medium text-fg">Delete one student&apos;s data</h3>
                <p className="mt-1 text-sm text-muted">Removes their profile, schools, dossiers, and share links, and leaves the rest of the account as it is.</p>
              </div>
              <ButtonLink href="/app/students" variant="secondary" className="shrink-0 self-start sm:self-auto">
                Open students
              </ButtonLink>
            </div>
          ) : null}

          <div id="delete-account" className="flex scroll-mt-8 flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
            <div className="max-w-md">
              <h3 className="text-sm font-medium text-fg">Delete account</h3>
              <p className="mt-1 text-sm text-muted">
                Deletes everything in this account right away: {what}, every dossier and share link, and purchase records. Shared school research
                holds no student data and stays.
              </p>
            </div>
            <div className="shrink-0">
              <DeleteAccount email={user.email} summary={deleteSummary} initialError={deleteError} />
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
