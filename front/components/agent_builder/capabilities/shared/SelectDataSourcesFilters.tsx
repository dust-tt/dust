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
import { useWatch } from "react-hook-form";
import { useMemo, useCallback } from "react";

import { DataSourceViewTagsFilterDropdown } from "@app/components/agent_builder/capabilities/shared/DataSourceViewTagsFilterDropdown";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import type { DataSourceBuilderTreeItemType } from "@app/components/data_source_view/context/types";
import { CONFIGURATION_SHEET_PAGE_IDS } from "@app/components/agent_builder/types";
import { useKnowledgePageContext } from "@app/components/data_source_view/context/PageContext";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  DATA_WAREHOUSE_SERVER_NAME,
  TABLE_QUERY_SERVER_NAME,
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
import { asDisplayName } from "@app/types";
import { pluralize } from "@app/types";

const tablesServer = [
  TABLE_QUERY_SERVER_NAME,
  TABLE_QUERY_V2_SERVER_NAME,
  DATA_WAREHOUSE_SERVER_NAME,
];

const getVisualForSourceItem = (
  source: DataSourceFilterItem["selectedSources"][0]
) => {
  if (source.type === "data_source") {
    return DocumentIcon;
  }

  if (source.type === "node") {
    // Handle mime type specific cases first (mirrors getVisualForContentNode logic)
    if (source.mimeType) {
      // Handle private channels with lock icon
      if (CHANNEL_INTERNAL_MIME_TYPES.includes(source.mimeType)) {
        return source.providerVisibility === "private"
          ? LockIcon
          : ChatBubbleLeftRightIcon;
      }

      // Handle database-like content
      if (DATABASE_INTERNAL_MIME_TYPES.includes(source.mimeType)) {
        return Square3Stack3DIcon;
      }

      // Handle file-like content that isn't a document type
      if (FILE_INTERNAL_MIME_TYPES.includes(source.mimeType)) {
        // For file-like content, check if expandable (like getVisualForFileContentNode)
        return source.expandable ? DocumentPileIcon : DocumentIcon;
      }

      // Handle spreadsheets
      if (SPREADSHEET_INTERNAL_MIME_TYPES.includes(source.mimeType)) {
        return FolderTableIcon;
      }
    }

    // Fall back to node type if mime type doesn't determine the icon
    if (source.nodeType) {
      try {
        return getVisualForContentNodeType(source.nodeType);
      } catch {
        // Graceful fallback if nodeType is invalid
        return DocumentIcon;
      }
    }
  }

  return DocumentIcon;
};

const processDataSourceBuilderItem = (
  source: DataSourceBuilderTreeItemType
) => {
  if (source.type === "data_source") {
    return {
      dustAPIDataSourceId: source.dataSourceView.dataSource.dustAPIDataSourceId,
      dataSourceView: source.dataSourceView,
      sourceItem: {
        id: source.dataSourceView.id.toString(),
        name: "All documents",
        type: "data_source" as const,
        nodeType: undefined,
        mimeType: undefined,
        providerVisibility: undefined,
        expandable: undefined,
      },
    };
  }

  if (source.type === "node") {
    return {
      dustAPIDataSourceId:
        source.node.dataSourceView.dataSource.dustAPIDataSourceId,
      dataSourceView: source.node.dataSourceView,
      sourceItem: {
        id: source.node.internalId,
        name: source.node.title,
        type: "node" as const,
        nodeType: source.node.type,
        mimeType: source.node.mimeType,
        providerVisibility: source.node.providerVisibility,
        expandable: source.node.expandable,
      },
    };
  }

  throw new Error(`Unsupported source type: ${(source as any).type}`);
};

const groupSourcesByDataSource = (sources: DataSourceBuilderTreeItemType[]) => {
  return sources.reduce(
    (acc, source) => {
      // Skip non-data-source and non-node types
      if (source.type !== "data_source" && source.type !== "node") {
        return acc;
      }

      try {
        const { dustAPIDataSourceId, dataSourceView, sourceItem } =
          processDataSourceBuilderItem(source);

        if (!acc[dustAPIDataSourceId]) {
          acc[dustAPIDataSourceId] = {
            dataSourceView,
            selectedSources: [],
          };
        }

        acc[dustAPIDataSourceId].selectedSources.push(sourceItem);
      } catch (error) {
        // Skip invalid source items gracefully
        console.warn("Failed to process source item:", source, error);
      }

      return acc;
    },
    {} as Record<string, DataSourceFilterItem>
  );
};

type DataSourceFilterItem = {
  dataSourceView: DataSourceViewType;
  selectedSources: Array<{
    id: string;
    name: string;
    type: "data_source" | "node";
    nodeType?: "table" | "folder" | "document";
    mimeType?: string;
    providerVisibility?: "public" | "private" | null;
    expandable?: boolean;
  }>;
};

type DataSourceTreeItemProps = {
  item: DataSourceFilterItem;
};

function DataSourceTreeItem({
  item: { dataSourceView, selectedSources },
}: DataSourceTreeItemProps) {
  const { isDark } = useTheme();
  const { spaces } = useSpacesContext();

  const spaceName = useMemo(
    () => spaces.find((s) => s.sId === dataSourceView.spaceId)?.name,
    [spaces, dataSourceView.spaceId]
  );

  const providerLogo = useMemo(
    () =>
      getConnectorProviderLogoWithFallback({
        provider: dataSourceView.dataSource.connectorProvider,
        isDark,
      }),
    [dataSourceView.dataSource.connectorProvider, isDark]
  );

  const displayName = useMemo(
    () => getDisplayNameForDataSource(dataSourceView.dataSource),
    [dataSourceView.dataSource]
  );

  // Filter out "All documents" entries - only show individual node selections
  const nodeItems = useMemo(
    () =>
      selectedSources
        .filter((source) => source.type === "node")
        .map((source) => ({
          id: source.id,
          name: source.name,
          visual: getVisualForSourceItem(source),
        })),
    [selectedSources]
  );

  const hasDataSourceSelection = useMemo(
    () => selectedSources.some((source) => source.type === "data_source"),
    [selectedSources]
  );

  // If entire data source is selected, don't show expandable tree
  if (hasDataSourceSelection && nodeItems.length === 0) {
    return (
      <Tree.Item
        label={displayName}
        visual={providerLogo}
        type="leaf"
        actions={
          spaceName ? (
            <span className="text-xs text-muted-foreground">{spaceName}</span>
          ) : undefined
        }
      />
    );
  }

  // If we have specific node selections, show them as expandable
  return (
    <Tree.Item
      label={displayName}
      visual={providerLogo}
      actions={
        spaceName ? (
          <span className="text-xs text-muted-foreground">{spaceName}</span>
        ) : undefined
      }
      defaultCollapsed={true}
    >
      <Tree>
        {nodeItems.map((item) => (
          <Tree.Item
            key={item.id}
            label={item.name}
            type="leaf"
            visual={item.visual}
          />
        ))}
      </Tree>
    </Tree.Item>
  );
}

export function SelectDataSourcesFilters() {
  const { setSheetPageId } = useKnowledgePageContext();
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });
  const mcpServerView = useWatch<CapabilityFormData, "mcpServerView">({
    name: "mcpServerView",
  });

  const { mcpServerViewsWithKnowledge } = useMCPServerViewsContext();

  const internalMcpServerView = mcpServerViewsWithKnowledge.find(
    (view) => view.sId === mcpServerView?.sId
  );

  const isTableOrWarehouseServer = tablesServer.find(
    (server) => server === internalMcpServerView?.server.name
  );

  const dataSourceViews = useMemo(
    () => groupSourcesByDataSource(sources.in),
    [sources.in]
  );

  const hasDataSources = useMemo(
    () => Object.values(dataSourceViews).length > 0,
    [dataSourceViews]
  );

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
