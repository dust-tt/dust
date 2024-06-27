import {
  Button,
  ContextItem,
  PlusIcon,
  ServerIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";

import type { AssistantBuilderTableConfiguration } from "@app/components/assistant_builder/types";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import { tableKey } from "@app/lib/client/tables_query";
import { classNames } from "@app/lib/utils";

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
        <div className="flex flex-row items-start">
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
            label="Select Tables"
            disabled={!canSelectTable}
            onClick={openTableModal}
          />
        ) : (
          <ContextItem.List className="mt-6 border-b border-t border-structure-200">
            {Object.values(tablesQueryConfiguration).map((t) => {
              const key = tableKey(t);
              return (
                <ContextItem
                  title={`${t.tableName} (${t.dataSourceId})`}
                  visual={<ContextItem.Visual visual={ServerIcon} />}
                  key={key}
                  action={
                    <Button.List>
                      <Button
                        icon={TrashIcon}
                        variant="secondaryWarning"
                        label="Remove"
                        labelVisible={false}
                        onClick={() => {
                          onDelete?.(key);
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
