import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-out disabled:pointer-events-none disabled:opacity-45 select-none";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]",
  secondary: "bg-raised text-fg shadow-raise hover:bg-overlay hover:shadow-[0_0_0_1px_var(--line-strong)]",
  ghost: "text-muted hover:text-fg hover:bg-hover",
  danger: "bg-bad-wash text-bad shadow-[0_0_0_1px_color-mix(in_srgb,var(--bad)_35%,transparent)] hover:bg-bad hover:text-white",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-base",
};

export function buttonClasses({
  variant = "secondary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}
