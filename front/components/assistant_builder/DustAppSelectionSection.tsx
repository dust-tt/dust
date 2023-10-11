import {
  Button,
  CommandLineIcon,
  ContextItem,
  PlusIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";

import { AssistantBuilderDustAppConfiguration } from "@app/components/assistant_builder/AssistantBuilder";
import { classNames } from "@app/lib/utils";

export default function DustAppSelectionSection({
  show,
  dustAppConfiguration,
  openDustAppModal,
  onDelete,
}: {
  show: boolean;
  dustAppConfiguration: AssistantBuilderDustAppConfiguration | null;
  openDustAppModal: () => void;
  onDelete?: (sId: string) => void;
}) {
  return (
    <Transition
      show={show}
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-all duration-300"
      enter="transition-all duration-300"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
      className="overflow-hidden pt-6"
      afterEnter={() => {
        window.scrollBy({
          left: 0,
          top: 140,
          behavior: "smooth",
        });
      }}
    >
      <div>
        <div className="flex flex-row items-start">
          <div className="pb-3 text-sm font-bold">Select a Dust App:</div>
        </div>
        {!dustAppConfiguration ? (
          <div
            className={classNames(
              "flex h-full min-h-48 items-center justify-center rounded-lg bg-structure-50"
            )}
          >
            <Button
              labelVisible={true}
              label="Select Dust App"
              variant="primary"
              size="md"
              icon={PlusIcon}
              onClick={openDustAppModal}
            />
          </div>
        ) : (
          <ContextItem.List className="mt-6 border-b border-t border-structure-200">
            <ContextItem
              key={dustAppConfiguration.app.sId}
              title={dustAppConfiguration.app.name}
              visual={<ContextItem.Visual visual={CommandLineIcon} />}
              action={
                <Button.List>
                  <Button
                    icon={TrashIcon}
                    variant="secondaryWarning"
                    label="Remove"
                    labelVisible={false}
                    onClick={() => {
                      onDelete?.(dustAppConfiguration.app.sId);
                    }}
                  />
                </Button.List>
              }
            >
              <ContextItem.Description
                description={dustAppConfiguration.app.description || ""}
              />
            </ContextItem>
          </ContextItem.List>
        )}
      </div>
    </Transition>
  );
}
