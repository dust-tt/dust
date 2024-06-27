import {
  Button,
  CommandLineIcon,
  ContextItem,
  TrashIcon,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";

import type { AssistantBuilderDustAppConfiguration } from "@app/components/assistant_builder/types";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import { classNames } from "@app/lib/utils";

export default function DustAppSelectionSection({
  show,
  dustAppConfiguration,
  openDustAppModal,
  onDelete,
  canSelectDustApp,
}: {
  show: boolean;
  dustAppConfiguration: AssistantBuilderDustAppConfiguration;
  openDustAppModal: () => void;
  onDelete?: (sId: string) => void;
  canSelectDustApp: boolean;
}) {
  return (
    <Transition
      as="div"
      show={show}
      afterEnter={() => {
        window.scrollBy({
          left: 0,
          top: 140,
          behavior: "smooth",
        });
      }}
    >
      <div
        className={classNames(
          "overflow-hidden pt-6",
          "transition-all",
          "data-[enter]:duration-300",
          "data-[leave]:duration-300",
          "data-[enter]:data-[closed]:opacity-0",
          "data-[enter]:data-[open]:opacity-100",
          "data-[leave]:data-[open]:opacity-100",
          "data-[leave]:data-[closed]:opacity-0"
        )}
      >
        {!dustAppConfiguration.app ? (
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
                      if (dustAppConfiguration.app) {
                        onDelete?.(dustAppConfiguration.app.sId);
                      }
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
