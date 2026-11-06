"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import type { BuyAvailability, PaymentsMode } from "@/lib/billing/overview";
import { formatMoney } from "@/lib/billing/plans";
import type { AccountRole, PurchaseKind } from "@/lib/types";

export interface PlanPurchaseProps {
  payments: PaymentsMode;
  role: AccountRole | null;
  prices: { school: string; unlimited: string; counselor: string; schoolCents: number };
  counselorMaxStudents: number;
  maxCredits: number;
  schoolCredit: BuyAvailability;
  counselor: BuyAvailability & { active: boolean; endsAt: string | null };
  students: { id: string; name: string; isSelf: boolean; unlimited: BuyAvailability; unlimitedEndsAt: string | null }[];
}

type Errors = Partial<Record<PurchaseKind, string>>;

const CREDIT_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

function BuyRow({
  title,
  price,
  detail,
  note,
  error,
  controls,
}: {
  title: string;
  price: string;
  detail: ReactNode;
  note?: string | null;
  error?: string;
  controls: ReactNode;
}) {
  return (
    <li className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="text-sm font-medium text-fg">{title}</span>
          <span className="tabular text-sm text-muted">{price}</span>
        </p>
        <p className="mt-1 text-sm text-muted">{detail}</p>
        {note ? <p className="mt-2 text-xs text-subtle">{note}</p> : null}
        {error ? (
          <p className="mt-2 text-xs text-bad" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">{controls}</div>
    </li>
  );
}

export function PlanPurchase(props: PlanPurchaseProps) {
  const { payments, role, prices } = props;
  const router = useRouter();
  const ids = { credits: useId(), student: useId() };
  const [pending, setPending] = useState<PurchaseKind | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [announcement, setAnnouncement] = useState("");
  const [quantity, setQuantity] = useState(1);
  const choosable = props.students.filter((s) => s.unlimited.available);
  const [studentId, setStudentId] = useState(choosable[0]?.id ?? "");
  const chosen = props.students.find((s) => s.id === studentId && s.unlimited.available) ?? choosable[0];

  const simulated = payments === "simulated";
  const off = payments === "unavailable";
  const busy = pending !== null;

  async function buy(kind: PurchaseKind, body: Record<string, unknown>) {
    setPending(kind);
    setErrors((e) => ({ ...e, [kind]: undefined }));
    setAnnouncement("");
    try {
      const res = await fetch(simulated ? "/api/billing/simulate" : "/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, ...body }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; message?: string };
      if (!res.ok) {
        setErrors((e) => ({ ...e, [kind]: data.error ?? "That did not go through. Try again in a moment." }));
        setPending(null);
        return;
      }
      if (!simulated && data.url) {
        setAnnouncement("Opening Stripe checkout.");
        window.location.assign(data.url);
        return;
      }
      setAnnouncement(data.message ?? "Simulated purchase recorded.");
      setPending(null);
      router.refresh();
    } catch {
      setErrors((e) => ({ ...e, [kind]: "WhyUs could not be reached. Check your connection and try again." }));
      setPending(null);
    }
  }

  const label = (kind: PurchaseKind, text: string) => {
    if (pending === kind) return simulated ? "Recording…" : "Opening checkout…";
    return simulated ? "Development: simulate purchase" : text;
  };

  const creditTotal = formatMoney(quantity * prices.schoolCents);
  const creditWhat = quantity === 1 ? "1 school credit" : `${quantity} school credits`;
  const self = role === "student" ? props.students.find((s) => s.isSelf) ?? props.students[0] : undefined;
  const unlimitedTarget = role === "student" ? self : chosen;
  const unlimitedNote =
    props.students.length === 0
      ? "Add a student first."
      : role === "student"
        ? (self?.unlimited.reason ?? null)
        : choosable.length === 0
          ? props.counselor.active
            ? (props.students[0]?.unlimited.reason ?? null)
            : "Every student on this account already has unlimited schools."
          : null;
  const counselorWhat = props.counselor.active ? `another counselor plan (${props.counselorMaxStudents} more students)` : "the counselor plan";

  return (
    <div className="overflow-hidden rounded-lg bg-raised shadow-raise">
      {simulated ? (
        <div className="border-b border-line bg-sunken px-5 py-3.5">
          <p className="text-sm font-medium text-fg">Development: simulate purchase</p>
          <p className="mt-0.5 text-xs text-muted">Stripe keys are not set, so these buttons record a simulated purchase. Nobody is charged.</p>
        </div>
      ) : off ? (
        <div className="border-b border-line bg-sunken px-5 py-3.5">
          <p className="text-sm text-muted">Payments are not available on this site right now.</p>
        </div>
      ) : null}

      <ul className="divide-y divide-line">
        <BuyRow
          title="School credit"
          price={`${prices.school} each`}
          detail="One more school on any student's list. Credits never expire."
          note={props.schoolCredit.reason}
          error={errors.school_credit}
          controls={
            <>
              <label htmlFor={ids.credits} className="sr-only">
                Number of school credits
              </label>
              <Select
                id={ids.credits}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                disabled={!props.schoolCredit.available || off || busy}
                className="h-9 w-[7.5rem]"
              >
                {CREDIT_CHOICES.filter((n) => n <= props.maxCredits).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "1 credit" : `${n} credits`}
                  </option>
                ))}
              </Select>
              <Button
                variant="secondary"
                disabled={!props.schoolCredit.available || off || busy}
                onClick={() => buy("school_credit", { quantity })}
                aria-label={simulated ? `Development: simulate purchase of ${creditWhat}` : undefined}
              >
                {label("school_credit", `Buy ${quantity === 1 ? "1 credit" : `${quantity} credits`} for ${creditTotal}`)}
              </Button>
            </>
          }
        />

        <BuyRow
          title="Unlimited"
          price={`${prices.unlimited} one time`}
          detail={role === "student" ? "Every school on your list for 12 months, without using credits." : "Every school for one student for 12 months, without using credits."}
          note={unlimitedNote}
          error={errors.unlimited}
          controls={
            <>
              {role !== "student" && props.students.length > 0 ? (
                <>
                  <label htmlFor={ids.student} className="sr-only">
                    Student
                  </label>
                  <Select
                    id={ids.student}
                    value={chosen?.id ?? ""}
                    onChange={(e) => setStudentId(e.target.value)}
                    disabled={choosable.length === 0 || off || busy}
                    className="h-9 w-[12rem]"
                  >
                    {props.students.map((s) => (
                      <option key={s.id} value={s.id} disabled={!s.unlimited.available}>
                        {s.unlimitedEndsAt ? `${s.name} (unlimited until ${s.unlimitedEndsAt})` : s.name}
                      </option>
                    ))}
                  </Select>
                </>
              ) : null}
              <Button
                variant="secondary"
                disabled={!unlimitedTarget?.unlimited.available || off || busy}
                onClick={() => unlimitedTarget && buy("unlimited", { studentId: unlimitedTarget.id })}
                aria-label={simulated ? `Development: simulate purchase of unlimited schools${unlimitedTarget && role !== "student" ? ` for ${unlimitedTarget.name}` : ""}` : undefined}
              >
                {label("unlimited", `Buy unlimited for ${prices.unlimited}`)}
              </Button>
            </>
          }
        />

        {role === "counselor" ? (
          <BuyRow
            title="Counselor plan"
            price={`${prices.counselor} one time`}
            detail={
              props.counselor.active
                ? `Active until ${props.counselor.endsAt}. Each extra plan adds ${props.counselorMaxStudents} students, with every school included.`
                : `Every school for up to ${props.counselorMaxStudents} students for 12 months, without using credits.`
            }
            note={props.counselor.reason}
            error={errors.counselor}
            controls={
              <Button
                variant="secondary"
                disabled={!props.counselor.available || off || busy}
                onClick={() => buy("counselor", {})}
                aria-label={simulated ? `Development: simulate purchase of ${counselorWhat}` : undefined}
              >
                {label("counselor", props.counselor.active ? `Add ${props.counselorMaxStudents} students for ${prices.counselor}` : `Buy the plan for ${prices.counselor}`)}
              </Button>
            }
          />
        ) : null}
      </ul>

      {!simulated && !off ? (
        <p className="border-t border-line px-5 py-3 text-xs text-subtle">Checkout opens on Stripe. WhyUs never sees your card details.</p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {announcement && simulated ? (
        <p className="border-t border-line px-5 py-3 text-sm text-fg" aria-hidden="true">
          {announcement}
        </p>
      ) : null}
    </div>
  );
}
