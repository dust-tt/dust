import {
  Button,
  ContextItem,
  PlusIcon,
  ServerIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";

import { AssistantBuilderDatabaseQueryConfiguration } from "@app/components/assistant_builder/AssistantBuilder";
import { classNames } from "@app/lib/utils";

export default function DatabaseSelectionSection({
  show,
  databaseQueryConfiguration: databaseQueryConfiguration,
  openDatabaseModal,
  onDelete,
  canSelecDatabase,
}: {
  show: boolean;
  databaseQueryConfiguration: AssistantBuilderDatabaseQueryConfiguration | null;
  openDatabaseModal: () => void;
  onDelete?: (sId: string) => void;
  canSelecDatabase: boolean;
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
          <div className="pb-3 text-sm font-bold text-element-900">
            Select a Database:
          </div>
        </div>
        {!databaseQueryConfiguration ? (
          <div
            className={classNames(
              "flex h-full min-h-48 items-center justify-center rounded-lg bg-structure-50"
            )}
          >
            <Button
              disabled={!canSelecDatabase}
              labelVisible={true}
              label="Select Database"
              variant="primary"
              size="md"
              icon={PlusIcon}
              onClick={openDatabaseModal}
            />
          </div>
        ) : (
          <ContextItem.List className="mt-6 border-b border-t border-structure-200">
            <ContextItem
              key={databaseQueryConfiguration.databaseId}
              title={databaseQueryConfiguration.databaseName}
              visual={<ContextItem.Visual visual={ServerIcon} />}
              action={
                <Button.List>
                  <Button
                    icon={TrashIcon}
                    variant="secondaryWarning"
                    label="Remove"
                    labelVisible={false}
                    onClick={() => {
                      onDelete?.(databaseQueryConfiguration.dataSourceId);
                    }}
                  />
                </Button.List>
              }
            ></ContextItem>
          </ContextItem.List>
        )}
      </div>
    </Transition>
  );
}
