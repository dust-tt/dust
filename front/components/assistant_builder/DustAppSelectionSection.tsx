import {
  Button,
  CommandLineIcon,
  ContextItem,
  TrashIcon,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";

import type { AssistantBuilderDustAppConfiguration } from "@app/components/assistant_builder/types";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";

export default function DustAppSelectionSection({
  show,
  dustAppConfiguration,
  openDustAppModal,
  onDelete,
  canSelectDustApp,
}: {
  show: boolean;
  dustAppConfiguration: AssistantBuilderDustAppConfiguration | null;
  openDustAppModal: () => void;
  onDelete?: (sId: string) => void;
  canSelectDustApp: boolean;
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
        {!dustAppConfiguration ? (
          <EmptyCallToAction
            label="Select Dust App"
            disabled={!canSelectDustApp}
            onClick={openDustAppModal}
          />
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
