import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconLock } from "@/components/ui/icons";
import { Logo } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { requireUser } from "@/lib/auth/session";
import { listStudents } from "@/lib/data/students";
import { graduationYearOptions, seniorClassYear } from "@/lib/profile/years";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your account" };

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  if (user.role) {
    // Parents and counselors add students from the app; a student account only
    // comes back here if its own profile is missing.
    if (user.role !== "student") redirect("/app");
    const students = await listStudents(user.id);
    if (students.length > 0) redirect("/app");
  }

  return (
    <main className="min-h-dvh px-4 pt-6 pb-16 sm:px-8">
      <div className="mx-auto flex w-full max-w-[560px] items-center justify-between">
        <Link href="/" aria-label="WhyUs home">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <form action="/auth/logout" method="post">
            <button type="submit" className="h-8 rounded-md px-2.5 text-xs text-muted transition-colors hover:bg-hover hover:text-fg">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mx-auto mt-14 w-full max-w-[560px] sm:mt-20">
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-fg">Set up your account</h1>
        <p className="mt-2 text-sm text-muted">
          Signed in as <span className="text-fg">{user.email}</span>. Choose who this account is for, then add the first student profile.
        </p>

        <div className="mt-10">
          <OnboardingForm
            defaultRole={user.role ?? null}
            defaultName={user.name ?? ""}
            years={graduationYearOptions()}
            defaultYear={seniorClassYear()}
          />
        </div>

        <p className="mt-12 flex items-start gap-2 border-t border-line pt-6 text-xs text-subtle">
          <IconLock size={14} className="mt-0.5 shrink-0" />
          <span>
            Student data stays private to this account, is never used to train anything, and can be deleted completely from Settings.
          </span>
        </p>
      </div>
    </main>
  );
}
