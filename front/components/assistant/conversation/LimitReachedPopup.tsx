import { Button, Chip } from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";

export function LimitReachedPopup({
  planLimitReached,
}: {
  planLimitReached: boolean;
}) {
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
          label="Contact us" // TODO replace with "Check Dust plans"
          onClick={() => {
            window.open(
              "mailto:team@dust.tt?subject=Upgrading to paid plan" // TODO replace with the link to the plans page
            );
          }}
        />
      </div>
    </Transition>
  );
}
