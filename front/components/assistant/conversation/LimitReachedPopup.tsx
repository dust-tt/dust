import { Button, Chip } from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";
import { useRouter } from "next/router";

export function LimitReachedPopup({
  planLimitReached,
  workspaceId,
}: {
  planLimitReached: boolean;
  workspaceId: string;
}) {
  const router = useRouter();
  return (
    <Transition
      show={planLimitReached}
      enter="transition-opacity duration-300"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-opacity duration-300"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
      className="fixed bottom-16 right-16 z-30 flex w-64 flex-col gap-3 rounded-lg border border-amber-100 bg-amber-50 p-4 shadow-lg"
    >
      <div>
        <Chip color="red">Free plan</Chip>
      </div>
      <div className="text-sm font-normal text-element-900">
        Looks like you've used up all your messages. Contact us to know more
        about our paid plans.
      </div>
      <div className="self-center">
        <Button
          variant="primary"
          size="sm"
          label="Check Dust plans"
          onClick={async () => {
            await router.push(`/w/${workspaceId}/subscription`);
          }}
        />
      </div>
    </Transition>
  );
}
