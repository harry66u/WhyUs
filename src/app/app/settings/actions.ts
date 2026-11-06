"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { setUserName } from "@/lib/data/users";

export type AccountNameState = { status: "idle" } | { status: "saved"; name: string } | { status: "error"; message: string };

const MAX_NAME = 100;

/** Saves the account holder's name (shown in Settings and on the dashboard). */
export async function saveAccountNameAction(_prev: AccountNameState, formData: FormData): Promise<AccountNameState> {
  const user = await requireUser("/app/settings");
  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!name) return { status: "error", message: "Enter your name." };
  if (name.length > MAX_NAME) return { status: "error", message: `Keep your name under ${MAX_NAME} characters.` };
  try {
    await setUserName(user.id, name);
  } catch {
    return { status: "error", message: "Your name could not be saved just now. Try again in a moment." };
  }
  revalidatePath("/app", "layout");
  return { status: "saved", name };
}
