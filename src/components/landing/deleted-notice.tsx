"use client";

import { useSearchParams } from "next/navigation";

/**
 * Confirmation shown after an account is deleted (/api/account/delete sends the
 * browser to /?deleted=1). Client-only so the landing page stays static.
 */
export function DeletedNotice() {
  const params = useSearchParams();
  if (params.get("deleted") !== "1") return null;
  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-6 sm:px-6">
      <p role="status" className="rounded-md bg-ok-wash px-4 py-3 text-sm text-ok">
        Your account and all of its data were deleted: profiles, schools, dossiers, and share links.
      </p>
    </div>
  );
}
