import {
  Button,
  ChatBubbleLeftRightIcon,
  ContentMessage,
  DocumentIcon,
  DocumentPileIcon,
  FolderTableIcon,
  LockIcon,
  Square3Stack3DIcon,
  Tree,
} from "@dust-tt/sparkle";
import { useMemo } from "react";
import { useWatch } from "react-hook-form";

import { DataSourceViewTagsFilterDropdown } from "@app/components/agent_builder/capabilities/shared/DataSourceViewTagsFilterDropdown";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import { CONFIGURATION_SHEET_PAGE_IDS } from "@app/components/agent_builder/types";
import { useKnowledgePageContext } from "@app/components/data_source_view/context/PageContext";
import type { DataSourceBuilderTreeItemType } from "@app/components/data_source_view/context/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  DATA_WAREHOUSE_SERVER_NAME,
  TABLE_QUERY_V2_SERVER_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import {
  CHANNEL_INTERNAL_MIME_TYPES,
  DATABASE_INTERNAL_MIME_TYPES,
  FILE_INTERNAL_MIME_TYPES,
  getVisualForContentNodeType,
  SPREADSHEET_INTERNAL_MIME_TYPES,
} from "@app/lib/content_nodes";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import type { DataSourceViewType } from "@app/types";
import { asDisplayName, pluralize } from "@app/types";

const tablesServer = [TABLE_QUERY_V2_SERVER_NAME, DATA_WAREHOUSE_SERVER_NAME];

const getVisualForSourceItem = (
  source: DataSourceFilterItem["selectedSources"][0]
) => {
  if (source.type === "data_source") {
    return DocumentIcon;
  }

  if (source.type === "node") {
    // Handle mime type specific cases first (mirrors getVisualForContentNode logic)
    if (source.mimeType) {
      if (CHANNEL_INTERNAL_MIME_TYPES.includes(source.mimeType)) {
        return source.providerVisibility === "private"
          ? LockIcon
          : ChatBubbleLeftRightIcon;
      }
      if (DATABASE_INTERNAL_MIME_TYPES.includes(source.mimeType)) {
        return Square3Stack3DIcon;
      }

      if (FILE_INTERNAL_MIME_TYPES.includes(source.mimeType)) {
        return source.expandable ? DocumentPileIcon : DocumentIcon;
      }

      if (SPREADSHEET_INTERNAL_MIME_TYPES.includes(source.mimeType)) {
        return FolderTableIcon;
      }
    }

    if (source.nodeType) {
      try {
        return getVisualForContentNodeType(source.nodeType);
      } catch {
        return DocumentIcon;
      }
    }
  }
  return DocumentIcon;
};

const groupSourcesByDataSource = (sources: DataSourceBuilderTreeItemType[]) => {
  return sources.reduce(
    (acc, source) => {
      if (source.type !== "data_source" && source.type !== "node") {
        return acc;
      }

      const isDataSource = source.type === "data_source";
      const dataSourceView = isDataSource
        ? source.dataSourceView
        : source.node.dataSourceView;
      const dustAPIDataSourceId = dataSourceView.dataSource.dustAPIDataSourceId;

      const sourceItem = isDataSource
        ? ({
            id: source.dataSourceView.id.toString(),
            name: "All documents",
            type: "data_source",
          } satisfies SourceItem)
        : ({
            id: source.node.internalId,
            name: source.node.title,
            type: "node",
            nodeType: source.node.type,
            mimeType: source.node.mimeType,
            providerVisibility: source.node.providerVisibility,
            expandable: source.node.expandable,
          } satisfies SourceItem);

      if (!acc[dustAPIDataSourceId]) {
        acc[dustAPIDataSourceId] = { dataSourceView, selectedSources: [] };
      }

      acc[dustAPIDataSourceId].selectedSources.push(sourceItem);
      return acc;
    },
    {} as Record<string, DataSourceFilterItem>
  );
};

type SourceItem = {
  id: string;
  name: string;
  type: "data_source" | "node";
  nodeType?: "table" | "folder" | "document";
  mimeType?: string;
  providerVisibility?: "public" | "private" | null;
  expandable?: boolean;
};

type DataSourceFilterItem = {
  dataSourceView: DataSourceViewType;
  selectedSources: SourceItem[];
};

type DataSourceTreeItemProps = {
  item: DataSourceFilterItem;
};

function DataSourceTreeItem({
  item: { dataSourceView, selectedSources },
}: DataSourceTreeItemProps) {
  const { isDark } = useTheme();
  const { spaces } = useSpacesContext();

  const spaceName = spaces.find((s) => s.sId === dataSourceView.spaceId)?.name;
  const providerLogo = getConnectorProviderLogoWithFallback({
    provider: dataSourceView.dataSource.connectorProvider,
    isDark,
  });
  const displayName = getDisplayNameForDataSource(dataSourceView.dataSource);

  const nodeItems = selectedSources.filter((source) => source.type === "node");
  const hasDataSourceSelection = selectedSources.some(
    (source) => source.type === "data_source"
  );

  const actions = spaceName ? (
    <span className="text-xs text-muted-foreground">{spaceName}</span>
  ) : undefined;

  // If entire data source is selected and no specific nodes, show as leaf
  if (hasDataSourceSelection && nodeItems.length === 0) {
    return (
      <Tree.Item
        label={displayName}
        visual={providerLogo}
        type="leaf"
        actions={actions}
      />
    );
  }

  // Show expandable tree with node selections
  return (
    <Tree.Item
      label={displayName}
      visual={providerLogo}
      actions={actions}
      defaultCollapsed={true}
    >
      <Tree>
        {nodeItems.map((source) => (
          <Tree.Item
            key={source.id}
            label={source.name}
            type="leaf"
            visual={getVisualForSourceItem(source)}
          />
        ))}
      </Tree>
    </Tree.Item>
  );
}

export function SelectedDataSources() {
  const { setSheetPageId } = useKnowledgePageContext();
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });
  const mcpServerView = useWatch<CapabilityFormData, "mcpServerView">({
    name: "mcpServerView",
  });

  const { mcpServerViewsWithKnowledge } = useMCPServerViewsContext();

  const internalMcpServerView = mcpServerViewsWithKnowledge.find(
    (view) => view.sId === mcpServerView?.sId
  );

  const isTableOrWarehouseServer = tablesServer.includes(
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    internalMcpServerView?.server.name || ""
  );

  const dataSourceViews = useMemo(() => {
    // Combine both inclusions and exclusions for unified display
    // The navigation initialization and selection state logic now handle the "select all with exclusions" case
    const inclusionViews = groupSourcesByDataSource(sources.in);
    const exclusionViews = groupSourcesByDataSource(sources.notIn);

    // Merge exclusion views into inclusion views
    // If a data source has exclusions but no inclusions, it represents a "select all with exclusions" case
    Object.entries(exclusionViews).forEach(([key, exclusionView]) => {
      if (!inclusionViews[key]) {
        // This data source has exclusions but no explicit inclusions - it's a "select all" case
        inclusionViews[key] = {
          dataSourceView: exclusionView.dataSourceView,
          selectedSources: [
            {
              id: exclusionView.dataSourceView.id.toString(),
              name: "All documents",
              type: "data_source",
            },
          ],
        };
      }
    });

    return inclusionViews;
  }, [sources.in, sources.notIn]);

  const hasDataSources = Object.values(dataSourceViews).length > 0;

  if (!hasDataSources) {
    return (
      <ContentMessage
        title={`No ${isTableOrWarehouseServer ? "table" : "document"} detected`}
        variant="info"
        size="lg"
      >
        <div className="flex w-full flex-row items-center justify-between">
          <span>
            We couldn't find any{" "}
            {isTableOrWarehouseServer ? "tables" : "documents"} in your
            selection. Add {isTableOrWarehouseServer ? "tables" : "documents"}{" "}
            to enable "{asDisplayName(mcpServerView?.server.name)}".
          </span>
          <Button
            label="Select data sources"
            variant="outline"
            size="xs"
            onClick={() =>
              setSheetPageId(CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION)
            }
          />
        </div>
      </ContentMessage>
    );
  }

  return (
    <div className="space-y-4">
      <div className="align-center flex flex-row justify-between">
        <h3 className="mb-2 text-lg font-semibold">
          Selected data source{pluralize(Object.values(dataSourceViews).length)}
        </h3>

        <div className="flex flex-row items-center space-x-2">
          <Button
            label="Manage selection"
            onClick={() =>
              setSheetPageId(CONFIGURATION_SHEET_PAGE_IDS.DATA_SOURCE_SELECTION)
            }
          />
          <DataSourceViewTagsFilterDropdown />
        </div>
      </div>

      <div>
        <div className="rounded-xl bg-muted p-2 dark:bg-muted-night">
          <div className="max-h-60 overflow-y-auto">
            <Tree>
              {Object.values(dataSourceViews).map((item) => (
                <DataSourceTreeItem key={item.dataSourceView.id} item={item} />
              ))}
            </Tree>
          </div>
        </div>
      </div>
    </div>
  );
}
