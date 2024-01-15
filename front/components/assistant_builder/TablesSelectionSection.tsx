import { Button, ContextItem, ServerIcon, TrashIcon } from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";

import { AssistantBuilderTableConfiguration } from "@app/components/assistant_builder/AssistantBuilder";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";

export default function TablesSelectionSection({
  show,
  tableQueryConfiguration,
  openTableModal,
  onDelete,
  canSelectTable,
}: {
  show: boolean;
  tableQueryConfiguration: AssistantBuilderTableConfiguration | null;
  openTableModal: () => void;
  onDelete?: (sId: string) => void;
  canSelectTable: boolean;
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
            Select a Table:
          </div>
        </div>
        {!tableQueryConfiguration ? (
          <EmptyCallToAction
            label="Select Table"
            disabled={!canSelectTable}
            onClick={openTableModal}
          />
        ) : (
          <ContextItem.List className="mt-6 border-b border-t border-structure-200">
            <ContextItem
              key={`${tableQueryConfiguration.dataSourceId}/${tableQueryConfiguration.tableId}`}
              title={tableQueryConfiguration.tableId} // TODO: fetch table name
              visual={<ContextItem.Visual visual={ServerIcon} />}
              action={
                <Button.List>
                  <Button
                    icon={TrashIcon}
                    variant="secondaryWarning"
                    label="Remove"
                    labelVisible={false}
                    onClick={() => {
                      onDelete?.(tableQueryConfiguration.dataSourceId);
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
