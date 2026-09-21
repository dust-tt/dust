import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { DataSourceListItem } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import {
  DataSourceList,
  toDataSourceListItem,
} from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { buildDataSourceViewItems } from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import {
  findCategoryFromNavigationHistory,
  findSpaceFromNavigationHistory,
} from "@app/components/data_source_view/context/utils";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useSpaceDataSourceViews } from "@app/lib/swr/spaces";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import { Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

export function DataSourceViewTable({
  viewType,
}: {
  viewType: ContentNodesViewType;
}) {
  const { owner } = useAgentBuilderContext();
  const { navigationHistory, setDataSourceViewEntry } =
    useDataSourceBuilderContext();
  const space = findSpaceFromNavigationHistory(navigationHistory);
  const { isDark } = useTheme();

  const selectedCategory = findCategoryFromNavigationHistory(navigationHistory);
  const { spaceDataSourceViews, isSpaceDataSourceViewsLoading } =
    useSpaceDataSourceViews({
      category: selectedCategory ?? undefined,
      workspaceId: owner.sId,
      spaceId: space?.sId ?? "",
    });

  const listItems: DataSourceListItem[] = useMemo(
    () =>
      buildDataSourceViewItems(spaceDataSourceViews, { viewType, isDark }).map(
        (item) =>
          toDataSourceListItem(item, () =>
            setDataSourceViewEntry(item.dataSourceView)
          )
      ),
    [spaceDataSourceViews, viewType, isDark, setDataSourceViewEntry]
  );

  if (isSpaceDataSourceViewsLoading) {
    return (
      <div className="flex justify-center p-4">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <DataSourceList items={listItems} showSelectAllHeader headerTitle="Name" />
  );
}
