"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { deleteApplication, getApplication } from "@/lib/data/applications";
import { startResearch } from "@/lib/research/runner";

export type RemoveResult = { ok: true } | { ok: false; message: string };

/** Remove a school from the student's list (its research and dossier go with it). */
export async function removeApplicationAction(applicationId: string): Promise<RemoveResult> {
  const user = await requireUser("/app");
  if (typeof applicationId !== "string" || !applicationId || applicationId.length > 64) {
    return { ok: false, message: "That school could not be found. Reload the page and try again." };
  }
  const removed = await deleteApplication(user.id, applicationId);
  if (!removed) return { ok: false, message: "That school is no longer on this list. Reload the page to see the current list." };
  revalidatePath("/app");
  return { ok: true };
}

export type RerunResult = { ok: false; message: string };

/** Research a school again with the current profile, then open the live research view. */
export async function rerunResearchAction(applicationId: string): Promise<RerunResult> {
  const user = await requireUser("/app");
  const app = typeof applicationId === "string" && applicationId.length <= 64 ? await getApplication(user.id, applicationId) : null;
  if (!app) return { ok: false, message: "That school could not be found. Reload the page and try again." };
  try {
    await startResearch(app.id, { force: true });
  } catch {
    return { ok: false, message: "Research could not start right now. Try again in a moment." };
  }
  revalidatePath("/app");
  redirect(`/app/schools/${app.id}/research`);
}
