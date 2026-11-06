import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function DraftSchoolNotFound() {
  return (
    <div className="mx-auto w-full max-w-[760px] py-6">
      <EmptyState
        title="This school is not on your list"
        body="It may have been removed, or it belongs to a different account. Pick one of your schools to check a draft."
        action={
          <ButtonLink href="/app/draft" variant="secondary">
            Choose a school
          </ButtonLink>
        }
      />
    </div>
  );
}
