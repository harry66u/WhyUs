"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/components/ui/cn";
import { IconMoon, IconSun } from "@/components/ui/icons";

type Theme = "dark" | "light";

/** Same storage key and attribute as the root layout's theme script and the sidebar toggle. */
const STORAGE_KEY = "whyus-theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function read(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page only.
  }
}

const OPTIONS: { value: Theme; label: string; icon: typeof IconMoon }[] = [
  { value: "dark", label: "Dark", icon: IconMoon },
  { value: "light", label: "Light", icon: IconSun },
];

export function ThemeSetting() {
  const theme = useSyncExternalStore<Theme>(subscribe, read, () => "dark");
  return (
    <fieldset>
      <legend className="sr-only">Theme</legend>
      <div className="inline-flex rounded-md bg-sunken p-1 shadow-[0_0_0_1px_var(--line)]">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className={cn(
              "relative inline-flex h-8 cursor-pointer items-center gap-2 rounded-sm px-3.5 text-sm transition-[color,background-color,box-shadow] duration-150 has-[:focus-visible]:shadow-[0_0_0_2px_var(--focus)]",
              theme === value ? "bg-raised text-fg shadow-raise" : "text-muted hover:text-fg",
            )}
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              onChange={() => apply(value)}
              className="sr-only"
            />
            <Icon className={theme === value ? "text-accent-text" : "text-subtle"} />
            {label}
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-subtle">Saved in this browser. The sidebar toggle switches it too.</p>
    </fieldset>
  );
}
