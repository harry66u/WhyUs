import type { ReactNode } from "react";
import { formatDate, shortUrl } from "@/lib/format";
import { cn } from "./cn";
import { IconCheck, IconLink } from "./icons";

/** Pulsing dot for live research. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)} aria-hidden="true">
      <span className="absolute inset-0 rounded-full bg-accent animate-live" />
    </span>
  );
}

/** The WhyUs wordmark. The square is a citation marker, the product's unit of trust. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-[-0.02em] text-fg", className)}>
      <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-accent text-accent-fg" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1.5 2h2v6h-2M8.5 2h-2v6h2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-[1.05rem]">WhyUs</span>
    </span>
  );
}

/** Citation: where a fact came from and when it was confirmed. */
export function SourceLink({
  url,
  verifiedAt,
  className,
}: {
  url: string;
  verifiedAt?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle", className)}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-0 items-center gap-1.5 text-muted underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-fg hover:decoration-accent-line"
      >
        <span className="truncate">{shortUrl(url)}</span>
        <IconLink size={12} className="shrink-0" />
      </a>
      {verifiedAt ? (
        <span className="inline-flex items-center gap-1 text-ok">
          <IconCheck size={12} />
          <span className="tabular">Verified {formatDate(verifiedAt)}</span>
        </span>
      ) : null}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg px-6 py-12 text-center shadow-[0_0_0_1px_var(--line)] [background:repeating-linear-gradient(135deg,transparent_0_10px,var(--hover)_10px_11px)]", className)}>
      <p className="text-md font-medium text-fg">{title}</p>
      {body ? <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Page header used inside the app shell. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-fg">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-4 w-4 animate-spin text-muted", className)} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
