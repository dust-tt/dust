import {
  Button,
  ContextItem,
  PlusIcon,
  ServerIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";

import type { AssistantBuilderTableConfiguration } from "@app/components/assistant_builder/AssistantBuilder";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";

export default function TablesSelectionSection({
  show,
  tablesQueryConfiguration,
  openTableModal,
  onDelete,
  canSelectTable,
}: {
  show: boolean;
  tablesQueryConfiguration: Record<string, AssistantBuilderTableConfiguration>;
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
            Select Tables:
          </div>
          <div className="flex-grow" />
          {Object.keys(tablesQueryConfiguration).length > 0 && (
            <Button
              labelVisible={true}
              label="Add tables"
              variant="primary"
              size="sm"
              icon={PlusIcon}
              onClick={openTableModal}
              disabled={!canSelectTable}
              hasMagnifying={false}
            />
          )}
        </div>
        {!Object.keys(tablesQueryConfiguration).length ? (
          <EmptyCallToAction
            label="Add Tables"
            disabled={!canSelectTable}
            onClick={openTableModal}
          />
        ) : (
          <ContextItem.List className="mt-6 border-b border-t border-structure-200">
            {Object.values(tablesQueryConfiguration).map((t) => {
              const tableKey = `${t.workspaceId}/${t.dataSourceId}/${t.tableId}`;
              return (
                <ContextItem
                  title={t.tableId} // TODO: fetch table name
                  visual={<ContextItem.Visual visual={ServerIcon} />}
                  key={tableKey}
                  action={
                    <Button.List>
                      <Button
                        icon={TrashIcon}
                        variant="secondaryWarning"
                        label="Remove"
                        labelVisible={false}
                        onClick={() => {
                          onDelete?.(tableKey);
                        }}
                      />
                    </Button.List>
                  }
                />
              );
            })}
          </ContextItem.List>
        )}
      </div>
    </Transition>
  );
}
