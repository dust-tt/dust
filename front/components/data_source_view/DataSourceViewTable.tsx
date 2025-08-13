import { FolderIcon, ScrollableDataTable, Spinner } from "@dust-tt/sparkle";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import {
  findCategoryFromNavigationHistory,
  findSpaceFromNavigationHistory,
} from "@app/components/data_source_view/context/utils";
import type { DataSourceRowData } from "@app/components/data_source_view/hooks/useDataSourceColumns";
import { useDataSourceColumns } from "@app/components/data_source_view/hooks/useDataSourceColumns";
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

  const columns = useDataSourceColumns();
  const rows: DataSourceRowData[] = spaceDataSourceViews
    .filter((dsv) => {
      if (viewType === "data_warehouse") {
        return isRemoteDatabase(dsv.dataSource);
      } else if (viewType === "table") {
        return !isRemoteDatabase(dsv.dataSource);
      }

      return dsv.dataSource.connectorProvider !== "slack_bot";
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
        },
      } satisfies DataSourceRowData;
    })
    .toSorted((a, b) => a.title.localeCompare(b.title));

  if (isSpaceDataSourceViewsLoading) {
    return (
      <div className="flex justify-center p-4">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <ScrollableDataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
    />
  );
}
