import { Checkbox, Icon, Spinner } from "@dust-tt/sparkle";
import { Separator } from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { useSourcesFormController } from "@app/components/agent_builder/utils";
import { ConfirmContext } from "@app/components/Confirm";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import {
  addNodeToTree,
  computeNavigationPath,
  findDataSourceViewFromNavigationHistory,
  getLastNavigationHistoryEntryId,
  getLatestNodeFromNavigationHistory,
  navigationHistoryEntryTitle,
  pathToString,
  removeNodeFromTree,
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
  /**
   * If true, show a "Select All" header checkbox
   */
  showSelectAllHeader?: boolean;
  headerTitle?: string;
}

export function DataSourceList({
  items,
  onLoadMore,
  hasMore = false,
  isLoading = false,
  className,
  showCheckboxOnlyForPartialSelection = false,
  onSelectionChange,
  showSelectAllHeader = false,
  headerTitle = "Name",
}: DataSourceListProps) {
  const {
    isRowSelected,
    isRowSelectable,
    selectNode,
    removeNode,
    navigationHistory,
  } = useDataSourceBuilderContext();
  const { field } = useSourcesFormController();
  const confirm = useContext(ConfirmContext);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleLoadMore = useCallback(async () => {
    if (hasMore && !isLoading && onLoadMore) {
      await onLoadMore();
    }
  }, [hasMore, isLoading, onLoadMore]);

  // Infinite scroll implementation
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasMore || isLoading || !onLoadMore) {
      return;
    }

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Trigger loading when we're within 100px of the bottom
      if (scrollHeight - scrollTop - clientHeight < 100) {
        void handleLoadMore();
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMore, isLoading, onLoadMore, handleLoadMore]);

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

  // Calculate select all state
  const selectAllState = useMemo(() => {
    if (!showSelectAllHeader) {
      return false;
    }

    const selectableItems = items.filter((item) => {
      const hideCheckbox = shouldHideCheckbox(item);
      return !hideCheckbox && isRowSelectable(item.id);
    });

    if (selectableItems.length === 0) {
      return false;
    }

    const selectedCount = selectableItems.filter(
      (item) => isRowSelected(item.id) === true
    ).length;
    const partialCount = selectableItems.filter(
      (item) => isRowSelected(item.id) === "partial"
    ).length;

    if (selectedCount === selectableItems.length) {
      return true;
    }
    if (selectedCount > 0 || partialCount > 0) {
      return "partial";
    }
    return false;
  }, [
    showSelectAllHeader,
    items,
    shouldHideCheckbox,
    isRowSelectable,
    isRowSelected,
  ]);

  const handleSelectAll = useCallback(async () => {
    const selectableItems = items.filter((item) => {
      const hideCheckbox = shouldHideCheckbox(item);
      return !hideCheckbox && isRowSelectable(item.id);
    });

    // Batch all operations into a single field update
    let newTreeValue = field.value;

    if (selectAllState === false) {
      // Currently unchecked -> select all unselected items
      const itemsToSelect = selectableItems.filter((item) => {
        const selectionState = isRowSelected(item.id);
        return selectionState !== true;
      });

      // Add each node to the tree
      for (const item of itemsToSelect) {
        const nodePath = computeNavigationPath(navigationHistory);
        nodePath.push(getLastNavigationHistoryEntryId(item.entry));

        newTreeValue = addNodeToTree(newTreeValue, {
          path: pathToString(nodePath),
          name: navigationHistoryEntryTitle(item.entry),
          ...item.entry,
        });
      }
    } else {
      // Currently checked or partial -> unselect all selected items
      const itemsToUnselect = selectableItems.filter((item) => {
        const selectionState = isRowSelected(item.id);
        return selectionState === true || selectionState === "partial";
      });

      if (itemsToUnselect.length > 0) {
        const confirmed = await confirm({
          title: "Are you sure?",
          message: `Do you want to unselect all selected items?`,
          validateLabel: "Unselect all",
          validateVariant: "warning",
        });

        if (!confirmed) {
          return;
        }
      }

      // Remove each node from the tree
      for (const item of itemsToUnselect) {
        const nodePath = computeNavigationPath(navigationHistory);
        nodePath.push(getLastNavigationHistoryEntryId(item.entry));

        newTreeValue = removeNodeFromTree(newTreeValue, {
          path: pathToString(nodePath),
          name: navigationHistoryEntryTitle(item.entry),
          ...item.entry,
        });
      }
    }
    field.onChange(newTreeValue);
  }, [
    items,
    shouldHideCheckbox,
    isRowSelectable,
    isRowSelected,
    selectAllState,
    field,
    navigationHistory,
    confirm,
  ]);

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
      ref={containerRef}
      className={cn("flex max-h-full flex-col overflow-auto pr-1", className)}
    >
      {showSelectAllHeader && (
        <div className="flex items-center gap-3 p-3 font-medium text-muted-foreground dark:text-muted-foreground">
          <Checkbox
            checked={selectAllState}
            onCheckedChange={handleSelectAll}
          />
          {headerTitle && <div>{headerTitle}</div>}
        </div>
      )}
      <Separator />
      {items.map((item) => {
        const selectionState = isRowSelected(item.id);
        const hideCheckbox = shouldHideCheckbox(item);
        const disabled = hideCheckbox || !isRowSelectable(item.id);

        const shouldShowCheckbox = showCheckboxOnlyForPartialSelection
          ? selectionState === "partial"
          : !hideCheckbox;

        return (
          <Fragment key={item.id}>
            <div
              className="flex cursor-pointer items-center gap-3 rounded-md p-3 hover:bg-muted/60"
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
              <div className="flex-1 truncate text-sm text-muted-foreground dark:text-muted-foreground">
                {item.title}
              </div>
            </div>
            <Separator />
          </Fragment>
        );
      })}

      {/* Loading indicator at the bottom */}
      {isLoading && hasMore && (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      )}
    </div>
  );
}
