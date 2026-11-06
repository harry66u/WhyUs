import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// Shared briefings are private links: keep them out of search engines, and do not
// send the link (which carries the token) as a referrer when readers follow citations.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
  referrer: "no-referrer",
};

export default function SharedDossierLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-[860px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="WhyUs home" className="rounded-md">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-subtle">Shared dossier, read only</span>
            <span data-print-hide>
              <ThemeToggle />
            </span>
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[860px] flex-col gap-3 px-4 py-8 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Research only. WhyUs never writes the essay.</p>
          <Link href="/" data-print-hide className="text-muted underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-fg">
            How WhyUs researches a school
          </Link>
        </div>
      </footer>
    </div>
  );
}
