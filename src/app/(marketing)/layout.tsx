import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const NAV_LINK = "rounded-md px-3 py-1.5 text-sm text-muted transition-colors duration-150 hover:text-fg";

/**
 * Marketing shell: header, the page's <main id="main">, and footer. Pages in
 * this group render their content directly (no <main> of their own).
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-50 focus:rounded-md focus:bg-overlay focus:px-3 focus:py-2 focus:text-sm focus:text-fg focus:shadow-pop"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--canvas)_82%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="WhyUs home" className="rounded-xs">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            <Link href="/#how-it-works" className={`hidden md:inline-flex ${NAV_LINK}`}>
              How it works
            </Link>
            <Link href="/pricing" className={`hidden sm:inline-flex ${NAV_LINK}`}>
              Pricing
            </Link>
            <Link href="/privacy" className={`hidden sm:inline-flex ${NAV_LINK}`}>
              Privacy
            </Link>
            <Link href="/login" className={NAV_LINK}>
              Sign in
            </Link>
            <ThemeToggle />
            <ButtonLink href="/login" variant="secondary" size="sm" className="ml-1">
              Start free
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-10 text-sm text-subtle sm:px-6 md:flex-row md:items-center md:justify-between">
          <Logo className="text-muted" />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/#how-it-works" className="transition-colors hover:text-fg">
              How it works
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-fg">
              Pricing
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-fg">
              Privacy
            </Link>
            <Link href="/login" className="transition-colors hover:text-fg">
              Sign in
            </Link>
          </nav>
          <p>Research only. WhyUs never writes your essay.</p>
        </div>
      </footer>
    </div>
  );
}
