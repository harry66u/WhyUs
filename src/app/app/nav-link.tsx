"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export function NavLink({ href, icon, children, exact = false }: { href: string; icon: ReactNode; children: ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
        active ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg",
      )}
    >
      <span className={cn("shrink-0", active ? "text-accent-text" : "text-subtle")}>{icon}</span>
      {children}
    </Link>
  );
}
