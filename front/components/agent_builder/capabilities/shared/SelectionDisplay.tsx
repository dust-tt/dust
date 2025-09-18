import { Button, FolderIcon, MoreIcon } from "@dust-tt/sparkle";
import { ScrollArea } from "@dust-tt/sparkle";
import { useMemo } from "react";

import type { DataSourceViewSelectionConfigurations } from "@app/types";

interface SelectionDisplayProps {
  selectionConfigurations: DataSourceViewSelectionConfigurations;
}

export function SelectionDisplay({
  selectionConfigurations,
}: SelectionDisplayProps) {
  const selectedItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      path: string;
      dataSourceViewName: string;
    }> = [];

    Object.values(selectionConfigurations).forEach((config) => {
      config.selectedResources.forEach((resource) => {
        items.push({
          id: resource.internalId,
          title: resource.title,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          path: resource.parentTitle || "Root",
          dataSourceViewName: config.dataSourceView.dataSource.name,
        });
      });

      if (config.isSelectAll) {
        items.push({
          id: `${config.dataSourceView.sId}-all`,
          title: `All files from ${config.dataSourceView.dataSource.name}`,
          path: "Root",
          dataSourceViewName: config.dataSourceView.dataSource.name,
        });
      }
    });

    return items;
  }, [selectionConfigurations]);

  if (selectedItems.length === 0) {
    return null;
  }

  return (
    <div className="py-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">
          Selection ({selectedItems.length} items)
        </h3>
      </div>
      <ScrollArea className="flex max-h-60 flex-col">
        <div className="space-y-2">
          {selectedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 shadow-sm"
            >
              <FolderIcon className="h-6 w-6 flex-shrink-0 text-gray-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-gray-900">
                  {item.title}
                </div>
                <div className="truncate text-sm text-gray-500">
                  {item.dataSourceViewName}/{item.path}
                </div>
              </div>
              <Button
                variant="ghost"
                size="xs"
                icon={MoreIcon}
                onClick={() => {
                  // TODO: Implement item menu
                }}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
