import Link from "next/link";
import type { ReactNode } from "react";
import { IconLock, IconTrash, IconUser } from "@/components/ui/icons";
import type { LandingPrices } from "./prices";

const LINK =
  "mt-8 inline-flex rounded-xs text-sm font-medium text-fg underline decoration-line-strong underline-offset-[5px] transition-colors hover:decoration-accent-line";

function PrivacyPoint({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3">
      <span className="pt-0.5 text-muted">{icon}</span>
      <div>
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="mt-1 text-sm text-pretty text-muted">{children}</p>
      </div>
    </li>
  );
}

/** Pricing summary and the privacy promise, side by side on wide screens. */
export function PlansAndPrivacy({ prices }: { prices: LandingPrices }) {
  const rows: { label: string; value: string }[] = [
    { label: "Your first school", value: "Free" },
    { label: "Each additional school", value: prices.perSchool },
    { label: "Unlimited schools for one student", value: prices.unlimited },
    { label: "Counselors and families with several students", value: "Counselor plan" },
  ];

  return (
    <section aria-label="Pricing and privacy" className="border-t border-line">
      <div className="mx-auto grid max-w-[1200px] gap-16 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:py-28">
        <div className="lg:col-span-6">
          <h2 id="pricing-title" className="text-2xl font-semibold tracking-[-0.03em] text-fg sm:text-3xl">
            Your first school is free
          </h2>
          <p className="mt-4 max-w-[34rem] text-md text-pretty text-muted">Pay only when you add more schools. Payments go through Stripe.</p>
          <dl className="mt-8 divide-y divide-line border-y border-line">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-6 py-3.5">
                <dt className="text-sm text-muted">{row.label}</dt>
                <dd className="shrink-0 text-sm font-medium tabular text-fg">{row.value}</dd>
              </div>
            ))}
          </dl>
          <Link href="/pricing" className={LINK}>
            See plans and pricing
          </Link>
        </div>

        <div className="lg:col-span-5 lg:col-start-8">
          <h2 id="privacy-title" className="text-2xl font-semibold tracking-[-0.03em] text-fg sm:text-3xl">
            Private by default
          </h2>
          <p className="mt-4 max-w-[34rem] text-md text-pretty text-muted">What you add about yourself stays private and under your control.</p>
          <ul role="list" className="mt-8 space-y-6">
            <PrivacyPoint icon={<IconUser />} title="Only your account sees it">
              Your activities, schools, and dossiers stay private. A share link shows only the dossier you choose to share.
            </PrivacyPoint>
            <PrivacyPoint icon={<IconLock />} title="Never used for training">
              Nothing you add is used to train anything.
            </PrivacyPoint>
            <PrivacyPoint icon={<IconTrash />} title="Delete everything, anytime">
              Export your data or delete your account and everything in it from settings.
            </PrivacyPoint>
          </ul>
          <Link href="/privacy" className={LINK}>
            How WhyUs handles your data
          </Link>
        </div>
      </div>
    </section>
  );
}
