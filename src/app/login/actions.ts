"use server";

import { headers } from "next/headers";
import { requestSignIn } from "@/lib/auth/magic-link";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string; devLink?: string }
  | { status: "error"; message: string };

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const next = String(formData.get("next") ?? "") || null;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  // Sign-in links must never be built from request headers in production (a forged
  // Host header would send a valid token to someone else's domain).
  if (!process.env.APP_URL && process.env.NODE_ENV === "production") {
    return { status: "error", message: "Sign-in is not configured on this server." };
  }
  const appUrl = process.env.APP_URL || `http://${h.get("host") ?? "localhost:3000"}`;
  const result = await requestSignIn(email, { ip, next, appUrl });
  if (!result.ok) {
    const message =
      result.error === "invalid_email"
        ? "Enter a valid email address."
        : result.error === "rate_limited"
          ? "Too many sign-in requests. Wait a few minutes and try again."
          : "The sign-in email could not be sent. Try again in a moment.";
    return { status: "error", message };
  }
  return { status: "sent", email: email.trim().toLowerCase(), devLink: result.devLink };
}
