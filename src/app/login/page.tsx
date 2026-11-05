import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/misc";
import { getCurrentUser, safeNext } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await props.searchParams;
  const user = await getCurrentUser();
  if (user) redirect(user.role ? safeNext(next) : "/onboarding");

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-16">
      <div className="w-full max-w-[400px]">
        <Link href="/" className="mb-10 inline-flex" aria-label="WhyUs home">
          <Logo />
        </Link>
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">Sign in to WhyUs</h1>
        <p className="mt-2 mb-8 text-sm text-muted">Research every school on your list from official sources.</p>
        <LoginForm next={next ? safeNext(next) : null} expired={error === "expired"} />
      </div>
    </main>
  );
}
