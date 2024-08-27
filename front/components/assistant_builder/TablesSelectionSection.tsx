import {
  Button,
  ContextItem,
  PlusIcon,
  ServerIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";
import { useContext } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import type { AssistantBuilderTableConfiguration } from "@app/components/assistant_builder/types";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import { tableKey } from "@app/lib/client/tables_query";

export default function TablesSelectionSection({
  show,
  tablesQueryConfiguration,
  openTableModal,
  onDelete,
}: {
  show: boolean;
  tablesQueryConfiguration: Record<string, AssistantBuilderTableConfiguration>;
  openTableModal: () => void;
  onDelete?: (sId: string) => void;
}) {
  const { dataSourceViews } = useContext(AssistantBuilderContext);
  const canSelectTable = dataSourceViews.length > 0;

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
