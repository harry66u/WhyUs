"use client";

import { useSyncExternalStore } from "react";
import { cn } from "./cn";
import { IconMoon, IconSun } from "./icons";

type Theme = "dark" | "light";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
function read(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore<Theme>(subscribe, read, () => "dark");
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("whyus-theme", next);
        } catch {
          // storage unavailable (private mode): the choice lasts for this page only
        }
      }}
      className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg", className)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === "dark" ? <IconSun /> : <IconMoon />}
    </button>
  );
}
