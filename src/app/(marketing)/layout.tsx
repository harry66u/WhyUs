import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--canvas)_82%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="WhyUs home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            <Link href="/pricing" className="hidden rounded-md px-3 py-1.5 text-sm text-muted hover:text-fg sm:inline-flex">
              Pricing
            </Link>
            <Link href="/privacy" className="hidden rounded-md px-3 py-1.5 text-sm text-muted hover:text-fg sm:inline-flex">
              Privacy
            </Link>
            <Link href="/login" className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-fg">
              Sign in
            </Link>
            <ThemeToggle />
            <ButtonLink href="/login" variant="primary" size="sm" className="ml-1">
              Start free
            </ButtonLink>
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-10 text-sm text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo className="text-muted" />
          <div className="flex gap-6">
            <Link href="/pricing" className="hover:text-fg">Pricing</Link>
            <Link href="/privacy" className="hover:text-fg">Privacy</Link>
            <Link href="/login" className="hover:text-fg">Sign in</Link>
          </div>
          <p>Research only. WhyUs never writes your essay.</p>
        </div>
      </footer>
    </div>
  );
}
