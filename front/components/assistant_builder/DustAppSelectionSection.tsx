import {
  Button,
  CommandLineIcon,
  ContextItem,
  PencilSquareIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { useRouter } from "next/router";

import type { AssistantBuilderDustAppConfiguration } from "@app/components/assistant_builder/types";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";

export default function DustAppSelectionSection({
  owner,
  show,
  dustAppConfiguration,
  openDustAppModal,
  onDelete,
  canSelectDustApp,
}: {
  owner: LightWorkspaceType;
  show: boolean;
  dustAppConfiguration: AssistantBuilderDustAppConfiguration;
  openDustAppModal: () => void;
  onDelete?: (sId: string) => void;
  canSelectDustApp: boolean;
}) {
  const router = useRouter();

  const appPath = `/w/${owner.sId}/spaces/${dustAppConfiguration.app?.space.sId}/apps/${dustAppConfiguration.app?.sId}`;
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
                <div className="flex gap-2">
                  <Button
                    icon={PencilSquareIcon}
                    variant="outline"
                    tooltip="Edit"
                    onClick={() => router.push(appPath)}
                  />
                  <Button
                    icon={TrashIcon}
                    variant="warning"
                    tooltip="Remove"
                    onClick={() => {
                      if (dustAppConfiguration.app) {
                        onDelete?.(dustAppConfiguration.app.sId);
                      }
                    }}
                  />
                </div>
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
