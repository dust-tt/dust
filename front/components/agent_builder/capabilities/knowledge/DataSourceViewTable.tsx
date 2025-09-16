import { FolderIcon, Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { DataSourceListItem } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { DataSourceList } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import {
  findCategoryFromNavigationHistory,
  findSpaceFromNavigationHistory,
} from "@app/components/data_source_view/context/utils";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import {
  getDataSourceNameFromView,
  isRemoteDatabase,
} from "@app/lib/data_sources";
import { CATEGORY_DETAILS } from "@app/lib/spaces";
import { useSpaceDataSourceViews } from "@app/lib/swr/spaces";
import type { ContentNodesViewType } from "@app/types";

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
      spaceDataSourceViews
        .filter((dsv) => {
          if (dsv.dataSource.connectorProvider === "slack_bot") {
            return false;
          }

          switch (viewType) {
            case "data_warehouse":
              return isRemoteDatabase(dsv.dataSource);
            case "table":
              return !isRemoteDatabase(dsv.dataSource);
            default:
              return true;
          }
        })
        .map((dsv) => {
          const provider = dsv.dataSource.connectorProvider;

          const connectorProvider = provider
            ? CONNECTOR_CONFIGURATIONS[provider]
            : null;

          const icon = provider
            ? connectorProvider?.getLogoComponent(isDark) ??
              CATEGORY_DETAILS[dsv.category].icon
            : FolderIcon;

          return {
            id: dsv.sId,
            title: getDataSourceNameFromView(dsv),
            onClick: () => setDataSourceViewEntry(dsv),
            icon,
            entry: {
              type: "data_source",
              dataSourceView: dsv,
              tagsFilter: null,
            },
          } satisfies DataSourceListItem;
        })
        .toSorted((a, b) => a.title.localeCompare(b.title)),
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
