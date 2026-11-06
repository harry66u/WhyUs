"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";

/** Starts a fresh research run (force) and opens the live research view. */
export function RerunResearchButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/research/${encodeURIComponent(applicationId)}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ force: true }),
      });
      if (!res.ok) {
        let text = "Research could not start. Try again in a moment.";
        try {
          const data: unknown = await res.json();
          if (data && typeof data === "object" && "error" in data && typeof data.error === "string" && data.error) text = data.error;
        } catch {
          // not JSON
        }
        throw new Error(text);
      }
      router.push(`/app/schools/${encodeURIComponent(applicationId)}/research`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Research could not start.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button variant="primary" onClick={start} disabled={busy}>
        {busy ? <Spinner className="h-3.5 w-3.5 text-accent-fg" /> : null}
        {busy ? "Starting research" : "Run research again"}
      </Button>
      <p role="status" aria-live="polite" className={error ? "text-xs text-bad" : "sr-only"}>
        {error ?? ""}
      </p>
    </div>
  );
}
