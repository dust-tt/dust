import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { DataSourceListItem } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import {
  DataSourceList,
  toDataSourceListItem,
} from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { ConfirmContext } from "@app/components/Confirm";
import type { KnowledgeBrowserItem } from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import { useKnowledgeBrowserItems } from "@app/components/data_source_view/browser/useKnowledgeBrowserItems";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryState } from "@app/components/data_source_view/context/useNavigationHistory";
import { getLatestNodeFromNavigationHistory } from "@app/components/data_source_view/context/utils";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";
import { ArrowLeft, EmptyCTA, EmptyCTAButton, Spinner } from "@dust-tt/sparkle";
import { useCallback, useContext, useMemo } from "react";

interface DataSourceBrowserTableProps {
  viewType: ContentNodesViewType;
}

// Clicking a row moves the navigation into it; only expandable nodes can be entered.
function getRowNavigation(
  item: KnowledgeBrowserItem,
  navigation: NavigationHistoryState
): (() => void) | undefined {
  switch (item.kind) {
    case "space":
      return () => navigation.setSpaceEntry(item.space);
    case "category":
      return () => navigation.setCategoryEntry(item.category);
    case "data_source":
      return () => navigation.setDataSourceViewEntry(item.dataSourceView);
    case "node":
      return item.expandable
        ? () => navigation.addNodeEntry(item.node)
        : undefined;
    default:
      assertNeverAndIgnore(item);
      return undefined;
  }
}

/**
 * @cc [owner:smb2268,label:react] agent-builder-levels-share-browser-rows
 * Below the root, the knowledge sheet MUST list the rows `useKnowledgeBrowserItems` produces for
 * the current navigation level, so the Agent Builder and the knowledge pickers agree on which
 * categories, data source views and nodes appear and how they are named and iconed. Selection
 * behaviour stays per level: categories only expose a checkbox to unselect a partial selection,
 * data source views and nodes expose the select-all header while the level has a selectable row
 * (remote database views are browsed, not selected), and nodes page.
 */
export function DataSourceBrowserTable({
  viewType,
}: DataSourceBrowserTableProps) {
  const { owner } = useAgentBuilderContext();
  const navigation = useDataSourceBuilderContext();
  const { navigationHistory, navigateTo, removeNode } = navigation;
  const confirm = useContext(ConfirmContext);

  const currentEntry = navigationHistory[navigationHistory.length - 1];
  // Spaces are listed by `DataSourceSpaceSelector`; this table only renders below the root.
  const browser = useKnowledgeBrowserItems({
    owner,
    spaces: [],
    navigationHistory,
    viewType,
  });

  const listItems: DataSourceListItem[] = useMemo(
    () =>
      browser.items.map((item) =>
        toDataSourceListItem(item, getRowNavigation(item, navigation))
      ),
    [browser.items, navigation]
  );

  const handleCategorySelectionChange = useCallback(
    async (item: DataSourceListItem, selectionState: boolean | "partial") => {
      // Categories only show checkboxes for partial selections to unselect all
      if (selectionState === "partial") {
        const confirmed = await confirm({
          title: "Are you sure?",
          message: `Do you want to unselect all of "${item.title}"?`,
          validateLabel: "Unselect all",
          validateVariant: "warning",
        });
        if (confirmed) {
          removeNode(item.entry);
        }
      }
    },
    [confirm, removeNode]
  );

  if (browser.isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Spinner size="md" />
      </div>
    );
  }

  switch (currentEntry.type) {
    case "root":
      return null;
    case "space":
      return (
        <DataSourceList
          items={listItems}
          showCheckboxOnlyForPartialSelection
          onSelectionChange={handleCategorySelectionChange}
        />
      );
    case "category":
      return (
        <DataSourceList
          items={listItems}
          showSelectAllHeader
          headerTitle="Name"
        />
      );
    case "data_source":
    case "node": {
      const traversedNode =
        getLatestNodeFromNavigationHistory(navigationHistory);
      const isTopLevelInView =
        traversedNode === null || traversedNode.parentInternalIds === null;
      if (isTopLevelInView && listItems.length === 0) {
        return (
          <EmptyCTA
            title="No pages found"
            message="This website doesn't have any pages to browse yet."
            action={
              <EmptyCTAButton
                variant="primary"
                icon={ArrowLeft}
                label="Go back"
                onClick={() => navigateTo(navigationHistory.length - 2)}
              />
            }
          />
        );
      }
      return (
        <DataSourceList
          items={listItems}
          onLoadMore={browser.loadMore}
          hasMore={browser.hasMore}
          isLoading={browser.isLoadingMore}
          showSelectAllHeader
          headerTitle="Name"
        />
      );
    }
    default:
      // The navigation history is client state, so an unknown entry is a bug, not a newer server.
      assertNever(currentEntry);
  }
}
