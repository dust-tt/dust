import { Button, Checkbox, Icon } from "@dust-tt/sparkle";
import { Separator } from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import { memo, useCallback, useContext } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import {
  findDataSourceViewFromNavigationHistory,
  getLatestNodeFromNavigationHistory,
} from "@app/components/data_source_view/context/utils";
import { isRemoteDatabase } from "@app/lib/data_sources";

export interface DataSourceListItem {
  id: string;
  title: string;
  icon?: React.ComponentType;
  entry: NavigationHistoryEntryType;
  onClick?: () => void;
}

interface DataSourceListProps {
  items: DataSourceListItem[];
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  isLoading?: boolean;
  className?: string;
  /**
   * If true, only show checkboxes for partial selections (like categories/spaces)
   * If false (default), show checkboxes for all selectable items
   */
  showCheckboxOnlyForPartialSelection?: boolean;
  /**
   * Custom handler for selection changes. If provided, overrides default behavior.
   * Useful for categories/spaces that need special removeNode logic.
   */
  onSelectionChange?: (
    item: DataSourceListItem,
    selectionState: boolean | "partial",
    state: boolean | "indeterminate"
  ) => Promise<void>;
}

export const DataSourceList = memo(function DataSourceList({
  items,
  onLoadMore,
  hasMore = false,
  isLoading = false,
  className,
  showCheckboxOnlyForPartialSelection = false,
  onSelectionChange,
}: DataSourceListProps) {
  const {
    isRowSelected,
    isRowSelectable,
    selectNode,
    removeNode,
    navigationHistory,
  } = useDataSourceBuilderContext();
  const confirm = useContext(ConfirmContext);

  const handleLoadMore = useCallback(async () => {
    if (hasMore && !isLoading && onLoadMore) {
      await onLoadMore();
    }
  }, [hasMore, isLoading, onLoadMore]);

  const shouldHideCheckbox = useCallback(
    (item: DataSourceListItem): boolean => {
      if (item.entry.type === "data_source") {
        return isRemoteDatabase(item.entry.dataSourceView.dataSource);
      }
      if (item.entry.type === "node" && item.entry.node.type === "folder") {
        // Check if we're in a remote database context
        const traversedNode =
          getLatestNodeFromNavigationHistory(navigationHistory);
        const dataSourceView =
          findDataSourceViewFromNavigationHistory(navigationHistory);
        const dataSourceForHide =
          traversedNode?.dataSourceView ?? dataSourceView ?? null;

        return !!(
          dataSourceForHide && isRemoteDatabase(dataSourceForHide.dataSource)
        );
      }
      return false;
    },
    [navigationHistory]
  );

  const handleSelectionChange = useCallback(
    async (item: DataSourceListItem, state: boolean | "indeterminate") => {
      const selectionState = isRowSelected(item.id);

      // Use custom handler if provided (for categories/spaces)
      if (onSelectionChange) {
        await onSelectionChange(item, selectionState, state);
        return;
      }

      // Default behavior for data sources and nodes
      if (selectionState === "partial") {
        const confirmed = await confirm({
          title: "Are you sure?",
          message: `Do you want to unselect all of "${item.title}"?`,
          validateLabel: "Unselect all",
          validateVariant: "warning",
        });
        if (!confirmed) {
          return;
        }
        removeNode(item.entry);
        return;
      }

      if (state) {
        selectNode(item.entry);
      } else {
        // Special handling for data source unselection
        if (item.entry.type === "data_source") {
          const confirmed = await confirm({
            title: "Are you sure?",
            message: `Do you want to unselect "${item.title}"?`,
            validateLabel: "Unselect",
            validateVariant: "warning",
          });
          if (!confirmed) {
            return;
          }
        }
        removeNode(item.entry);
      }
    },
    [confirm, isRowSelected, removeNode, selectNode, onSelectionChange]
  );

  return (
    <div
      className={cn(
        "flex max-h-full flex-col gap-1 overflow-auto pr-1",
        className
      )}
    >
      <Separator />
      {items.map((item) => {
        const selectionState = isRowSelected(item.id);
        const hideCheckbox = shouldHideCheckbox(item);
        const disabled = hideCheckbox || !isRowSelectable(item.id);

        const shouldShowCheckbox = showCheckboxOnlyForPartialSelection
          ? selectionState === "partial"
          : !hideCheckbox;

        return (
          <>
            <div
              key={item.id}
              className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/60"
              onClick={() => item.onClick?.()}
            >
              {shouldShowCheckbox ? (
                <Checkbox
                  checked={selectionState}
                  disabled={disabled}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={(state) =>
                    handleSelectionChange(item, state)
                  }
                />
              ) : (
                <div className="w-5" />
              )}

              {item.icon && <Icon size="sm" visual={item.icon} />}
              <div className="flex-1 truncate text-sm text-foreground">
                {item.title}
              </div>
            </div>
            <Separator />
          </>
        );
      })}

      {hasMore && (
        <div className="flex justify-center p-2">
          <Button
            variant="outline"
            label={isLoading ? "Loading..." : "Load more"}
            onClick={() => void handleLoadMore()}
            disabled={isLoading}
          />
        </div>
      )}
    </div>
  );
});
