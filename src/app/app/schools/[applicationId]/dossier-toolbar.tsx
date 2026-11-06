"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { IconArrowLeft, IconCheck, IconDownload, IconDraft, IconShare } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/misc";

type Message = { tone: "ok" | "error" | "info"; text: string } | null;

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string" && data.error) return data.error;
  } catch {
    // not JSON
  }
  if (res.status === 401) return "Your session ended. Sign in again, then retry.";
  return fallback;
}

/**
 * Copy text, starting the clipboard write inside the click so browsers that
 * require a user gesture (Safari) still allow it after the link is created.
 */
async function writeClipboard(text: Promise<string>): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const blob = text.then((t) => new Blob([t], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return true;
    }
  } catch {
    // fall back to writeText below
  }
  try {
    const value = await text;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // clipboard unavailable (permissions or insecure context)
  }
  return false;
}

export function DossierToolbar({
  applicationId,
  dossierId,
  schoolName,
  initialShareUrl,
  pdfFileName,
}: {
  applicationId: string;
  dossierId: string;
  schoolName: string;
  initialShareUrl: string | null;
  pdfFileName: string;
}) {
  const router = useRouter();
  const ids = useId();
  const [shareUrl, setShareUrl] = useState<string | null>(initialShareUrl);
  const [shareBusy, setShareBusy] = useState<"create" | "stop" | null>(null);
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [confirmRerun, setConfirmRerun] = useState(false);
  const [rerunBusy, setRerunBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const shareInputRef = useRef<HTMLInputElement>(null);
  const rerunToggleRef = useRef<HTMLButtonElement>(null);
  const rerunConfirmRef = useRef<HTMLButtonElement>(null);
  const copiedTimer = useRef<number | undefined>(undefined);

  const shareEndpoint = `/api/dossiers/${encodeURIComponent(dossierId)}/share`;
  const pdfHref = `/api/dossiers/${encodeURIComponent(dossierId)}/pdf`;
  const researchHref = `/app/schools/${encodeURIComponent(applicationId)}/research`;

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);
  useEffect(() => {
    if (confirmRerun) rerunConfirmRef.current?.focus();
  }, [confirmRerun]);

  async function createLink(): Promise<string> {
    const res = await fetch(shareEndpoint, { method: "POST", headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(await readError(res, "The share link could not be created. Try again in a moment."));
    const data: unknown = await res.json();
    if (!data || typeof data !== "object" || !("url" in data) || typeof data.url !== "string") {
      throw new Error("The share link could not be created. Try again in a moment.");
    }
    return data.url;
  }

  async function copyShareLink() {
    if (shareBusy) return;
    setShareBusy("create");
    setMessage(null);
    const url = shareUrl ? Promise.resolve(shareUrl) : createLink();
    const copying = writeClipboard(url);
    try {
      const value = await url;
      setShareUrl(value);
      if (await copying) {
        setCopied(true);
        setMessage({ tone: "ok", text: "Share link copied" });
        window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopied(false), 2400);
      } else {
        setMessage({ tone: "info", text: "Share link created. Copy it from the field below." });
        window.setTimeout(() => shareInputRef.current?.select(), 0);
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "The share link could not be created." });
    } finally {
      setShareBusy(null);
    }
  }

  async function stopSharing() {
    if (shareBusy) return;
    setShareBusy("stop");
    setMessage(null);
    try {
      const res = await fetch(shareEndpoint, { method: "DELETE", headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(await readError(res, "Sharing could not be stopped. Try again in a moment."));
      setShareUrl(null);
      setCopied(false);
      setMessage({ tone: "ok", text: "Sharing stopped. The old link no longer works." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Sharing could not be stopped." });
    } finally {
      setShareBusy(null);
    }
  }

  async function exportPdf(event: MouseEvent<HTMLAnchorElement>) {
    // Let modified clicks (new tab, save link) go to the browser.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (pdfBusy) return;
    setPdfBusy(true);
    setMessage(null);
    try {
      const res = await fetch(pdfHref, { headers: { Accept: "application/pdf" } });
      if (!res.ok) throw new Error(await readError(res, "The PDF could not be created. Try again in a moment."));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage({ tone: "ok", text: "PDF exported" });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "The PDF could not be created." });
    } finally {
      setPdfBusy(false);
    }
  }

  function cancelRerun() {
    setConfirmRerun(false);
    rerunToggleRef.current?.focus();
  }

  async function rerun() {
    if (rerunBusy) return;
    setRerunBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/research/${encodeURIComponent(applicationId)}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ force: true }),
      });
      if (!res.ok) throw new Error(await readError(res, "Research could not start. Try again in a moment."));
      router.push(researchHref);
    } catch (err) {
      setRerunBusy(false);
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Research could not start." });
    }
  }

  function onConfirmKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !rerunBusy) {
      event.stopPropagation();
      cancelRerun();
    }
  }

  return (
    <div data-print-hide className="mb-10 space-y-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 self-start rounded-md text-sm text-muted transition-colors hover:text-fg sm:self-auto"
        >
          <IconArrowLeft />
          All schools
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={copyShareLink} disabled={shareBusy !== null} aria-describedby={shareUrl ? `${ids}-share-note` : undefined}>
            {shareBusy === "create" ? <Spinner className="h-3.5 w-3.5" /> : copied ? <IconCheck className="text-ok" /> : <IconShare />}
            {copied ? "Share link copied" : "Copy share link"}
          </Button>
          <a
            href={pdfHref}
            download={pdfFileName}
            onClick={exportPdf}
            aria-disabled={pdfBusy || undefined}
            className={buttonClasses({ size: "sm", className: cn(pdfBusy && "pointer-events-none opacity-70") })}
          >
            {pdfBusy ? <Spinner className="h-3.5 w-3.5" /> : <IconDownload />}
            {pdfBusy ? "Preparing PDF" : "Export PDF"}
          </a>
          <ButtonLink href={`/app/draft/${encodeURIComponent(applicationId)}`} size="sm" variant="primary">
            <IconDraft />
            Check a draft
          </ButtonLink>
          <Button
            ref={rerunToggleRef}
            size="sm"
            variant="ghost"
            onClick={() => (confirmRerun ? cancelRerun() : setConfirmRerun(true))}
            aria-expanded={confirmRerun}
            aria-controls={confirmRerun ? `${ids}-rerun` : undefined}
          >
            Run research again
          </Button>
        </div>
      </div>

      {shareUrl ? (
        <div className="flex flex-col gap-2.5 rounded-lg bg-raised px-3.5 py-3 shadow-raise sm:flex-row sm:items-center sm:gap-3">
          <p id={`${ids}-share-note`} className="text-xs text-muted sm:max-w-[16rem]">
            Anyone with this link can view this dossier. Your account details are not shown.
          </p>
          <label htmlFor={`${ids}-share-url`} className="sr-only">
            Share link
          </label>
          <input
            ref={shareInputRef}
            id={`${ids}-share-url`}
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="tabular h-8 min-w-0 flex-1 rounded-md bg-sunken px-2.5 text-xs text-fg shadow-[0_0_0_1px_var(--line)] focus:shadow-[0_0_0_1px_var(--accent-line),0_0_0_4px_var(--accent-wash)] focus:outline-none"
          />
          <Button size="sm" variant="ghost" onClick={stopSharing} disabled={shareBusy !== null} className="self-start sm:self-auto">
            {shareBusy === "stop" ? <Spinner className="h-3.5 w-3.5" /> : null}
            Stop sharing
          </Button>
        </div>
      ) : null}

      {confirmRerun ? (
        <div
          id={`${ids}-rerun`}
          role="group"
          aria-labelledby={`${ids}-rerun-text`}
          onKeyDown={onConfirmKeyDown}
          className="flex flex-col gap-3 rounded-lg bg-raised px-3.5 py-3 shadow-raise sm:flex-row sm:items-center sm:justify-between"
        >
          <p id={`${ids}-rerun-text`} className="text-sm text-muted">
            Research {schoolName} again? WhyUs rereads the official pages and builds a new dossier, which takes about two minutes.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button ref={rerunConfirmRef} size="sm" onClick={rerun} disabled={rerunBusy}>
              {rerunBusy ? <Spinner className="h-3.5 w-3.5" /> : null}
              {rerunBusy ? "Starting research" : "Run research again"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelRerun} disabled={rerunBusy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <p
        role="status"
        aria-live="polite"
        className={cn(
          "min-h-5 text-xs",
          message?.tone === "error" ? "text-bad" : message?.tone === "ok" ? "text-ok" : "text-muted",
          !message && "sr-only",
        )}
      >
        {message?.text ?? ""}
      </p>
    </div>
  );
}
