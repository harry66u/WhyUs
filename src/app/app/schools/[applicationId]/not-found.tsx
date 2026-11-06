import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function SchoolNotFound() {
  return (
    <div className="mx-auto w-full max-w-[760px] py-6">
      <EmptyState
        title="This school is not on your list"
        body="It may have been removed, or it belongs to a different account. Your schools are listed on the dashboard."
        action={
          <ButtonLink href="/app" variant="secondary">
            Back to schools
          </ButtonLink>
        }
      />
    </div>
  );
}
