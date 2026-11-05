/**
 * Transactional email (sign-in links). Uses Resend's HTTP API when
 * RESEND_API_KEY is set. Without it, development prints the link to the server
 * log; production refuses rather than silently dropping sign-in emails.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function devSignInAllowed(): boolean {
  return !emailConfigured() && process.env.NODE_ENV !== "production";
}

export async function sendSignInEmail(to: string, link: string): Promise<void> {
  if (!emailConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Email is not configured (set RESEND_API_KEY)");
    console.info(`[whyus] Sign-in link for ${to}: ${link}`);
    return;
  }
  const from = process.env.EMAIL_FROM || "WhyUs <onboarding@resend.dev>";
  const text = [
    "Sign in to WhyUs",
    "",
    "Use this link to sign in. It works once and expires in 20 minutes:",
    link,
    "",
    "If you did not ask to sign in, you can ignore this email.",
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#0e1116;background:#f5f6f8;padding:32px">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e3e6eb">
<p style="font-weight:600;font-size:16px;margin:0 0 16px">WhyUs</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 24px">Use the button below to sign in. The link works once and expires in 20 minutes.</p>
<p style="margin:0 0 24px"><a href="${encodeURI(link)}" style="display:inline-block;background:#f2b33d;color:#1b1303;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:8px">Sign in to WhyUs</a></p>
<p style="font-size:13px;color:#646d7c;line-height:1.5;margin:0">If you did not ask to sign in, you can ignore this email.</p>
</div></body></html>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject: "Your WhyUs sign-in link", text, html }),
  });
  if (!res.ok) throw new Error(`Email provider error (HTTP ${res.status})`);
}
