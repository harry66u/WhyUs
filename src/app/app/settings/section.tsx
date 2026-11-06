import type { ReactNode } from "react";

/** One settings group: title and explanation on the left, controls on the right (stacked on small screens). */
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-8 gap-6 border-b border-line py-10 last:border-b-0 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12"
    >
      <div>
        <h2 id={`${id}-title`} className="text-md font-medium text-fg">
          {title}
        </h2>
        <div className="mt-1.5 text-sm text-muted">{description}</div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** A label and value row inside a hairline list. */
export function SettingsRow({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-subtle">{label}</dt>
      <dd className="min-w-0 text-sm text-fg">
        {children}
        {hint ? <p className="mt-0.5 text-xs text-subtle">{hint}</p> : null}
      </dd>
    </div>
  );
}
