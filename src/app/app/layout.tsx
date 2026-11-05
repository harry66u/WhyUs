import Link from "next/link";
import { redirect } from "next/navigation";
import { IconDraft, IconGrid, IconSettings, IconUser, IconUsers } from "@/components/ui/icons";
import { Logo } from "@/components/ui/misc";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { requireUser } from "@/lib/auth/session";
import { getActiveStudent, listStudents } from "@/lib/data/students";
import { selectStudentAction } from "./actions";
import { NavLink } from "./nav-link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/app");
  if (!user.role) redirect("/onboarding");
  const [students, active] = await Promise.all([listStudents(user.id), getActiveStudent(user.id)]);
  const manages = user.role === "parent" || user.role === "counselor";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="border-b border-line bg-canvas lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex h-14 items-center justify-between px-4 lg:h-16 lg:px-5">
          <Link href="/app" aria-label="WhyUs dashboard">
            <Logo />
          </Link>
          <ThemeToggle className="lg:hidden" />
        </div>

        {manages && students.length > 0 ? (
          <form action={selectStudentAction} className="px-3 pb-3 lg:px-4">
            <label htmlFor="student-switcher" className="mb-1 block px-1 text-2xs text-subtle">
              Working on
            </label>
            <div className="flex gap-1.5">
              <select
                id="student-switcher"
                name="studentId"
                defaultValue={active?.id}
                className="h-8 min-w-0 flex-1 rounded-md bg-sunken px-2 text-sm text-fg shadow-[0_0_0_1px_var(--line)]"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="h-8 rounded-md px-2 text-xs text-muted shadow-[0_0_0_1px_var(--line)] hover:text-fg">
                Switch
              </button>
            </div>
          </form>
        ) : null}

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:px-4 lg:pb-0" aria-label="App">
          <NavLink href="/app" exact icon={<IconGrid />}>
            Schools
          </NavLink>
          <NavLink href="/app/profile" icon={<IconUser />}>
            Profile
          </NavLink>
          <NavLink href="/app/draft" icon={<IconDraft />}>
            Draft check
          </NavLink>
          {manages ? (
            <NavLink href="/app/students" icon={<IconUsers />}>
              Students
            </NavLink>
          ) : null}
          <NavLink href="/app/settings" icon={<IconSettings />}>
            Settings
          </NavLink>
        </nav>

        <div className="hidden items-center justify-between gap-2 border-t border-line px-4 py-3 lg:flex">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted" title={user.email}>
              {user.email}
            </p>
            <form action="/auth/logout" method="post">
              <button type="submit" className="text-xs text-subtle hover:text-fg">
                Sign out
              </button>
            </form>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      <main className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
        <div className="mx-auto w-full max-w-[1120px]">{children}</div>
      </main>
    </div>
  );
}
