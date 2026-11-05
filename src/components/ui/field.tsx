import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-md bg-sunken text-fg placeholder:text-subtle shadow-[0_0_0_1px_var(--line)] transition-shadow duration-150 hover:shadow-[0_0_0_1px_var(--line-strong)] focus:outline-none focus-visible:outline-none focus:shadow-[0_0_0_1px_var(--accent-line),0_0_0_4px_var(--accent-wash)] disabled:opacity-50 aria-[invalid=true]:shadow-[0_0_0_1px_var(--bad)]";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-sm font-medium text-fg", className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10 px-3 text-sm", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-28 px-3 py-2.5 text-sm leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-10 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pl-3 pr-9 text-sm", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%237a8392' stroke-width='1.5'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-bad" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
