import { Chip, Button } from "@dust-tt/sparkle";
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
        <Chip color="red">Test plan</Chip>
      </div>
      <div className="text-sm font-normal text-element-900">
        Looks like you've used up all your messages for this week. Take a peek
        at our plans:
      </div>
      <div className="self-center">
        <Button
          variant="primary"
          size="sm"
          label="Check Dust plans"
          onClick={() => {
            window.open(
              "https://dust.notion.site/Plans-6b8d7b0a6c3c4a7d8f6f8a6e2c0c3a5b"
            );
          }}
        />
      </div>
    </Transition>
  );
}
