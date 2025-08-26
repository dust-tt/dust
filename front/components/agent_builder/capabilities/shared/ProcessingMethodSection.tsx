import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useEffect, useMemo } from "react";
import { useController, useWatch } from "react-hook-form";

import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
import type { DataSourceBuilderTreeItemType } from "@app/components/data_source_view/context/types";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import {
  getAvatar,
  InternalActionIcons,
  isInternalAllowedIcon,
} from "@app/lib/actions/mcp_icons";
import {
  DATA_WAREHOUSE_SERVER_NAME,
  TABLE_QUERY_SERVER_NAME,
  TABLE_QUERY_V2_SERVER_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { isRemoteDatabase } from "@app/lib/data_sources";

const tablesServer = [TABLE_QUERY_SERVER_NAME, TABLE_QUERY_V2_SERVER_NAME];

function isRemoteDatabaseItem(item: DataSourceBuilderTreeItemType): boolean {
  return (
    (item.type === "data_source" &&
      isRemoteDatabase(item.dataSourceView.dataSource)) ||
    (item.type === "node" &&
      isRemoteDatabase(item.node.dataSourceView.dataSource))
  );
}

export function ProcessingMethodSection() {
  const { mcpServerViewsWithKnowledge, isMCPServerViewsLoading } =
    useMCPServerViewsContext();
  const {
    field: { value: mcpServerView, onChange },
  } = useController<CapabilityFormData, "mcpServerView">({
    name: "mcpServerView",
  });
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });

  const dataWarehouseServer = useMemo(
    () =>
      mcpServerViewsWithKnowledge.find(
        (serverView) =>
          serverView.serverType === "internal" &&
          serverView.server.name === DATA_WAREHOUSE_SERVER_NAME
      ),
    [mcpServerViewsWithKnowledge]
  );

  const tablesQueryServers = useMemo(
    () =>
      mcpServerViewsWithKnowledge.filter(
        (serverView) =>
          serverView.serverType === "internal" &&
          tablesServer.includes(serverView.server.name)
      ),
    [mcpServerViewsWithKnowledge]
  );

  const [serversToDisplay, displayWarningTableQuery] = useMemo((): [
    MCPServerViewTypeWithLabel[] | null,
    boolean,
  ] => {
    if (sources.in.length <= 0) {
      return [null, false];
    }

    const onlyRemote = sources.in.every(isRemoteDatabaseItem);
    if (onlyRemote) {
      if (dataWarehouseServer) {
        return [[dataWarehouseServer, ...tablesQueryServers], false];
      }
      return [tablesQueryServers, false];
    }

    const onlyTableQueries = sources.in.every(
      (item) =>
        (item.type === "node" && item.node.type === "table") ||
        isRemoteDatabaseItem(item)
    );
    if (onlyTableQueries) {
      return [tablesQueryServers, false];
    }

    return [
      mcpServerViewsWithKnowledge.filter(
        (serverView) =>
          serverView.server.name !== DATA_WAREHOUSE_SERVER_NAME &&
          !tablesServer.includes(serverView.server.name)
      ),
      sources.in.some(
        (item) =>
          (item.type === "data_source" &&
            isRemoteDatabase(item.dataSourceView.dataSource)) ||
          (item.type === "node" &&
            isRemoteDatabase(item.node.dataSourceView.dataSource)) ||
          (item.type === "node" && item.node.type === "table")
      ),
    ];
  }, [
    dataWarehouseServer,
    mcpServerViewsWithKnowledge,
    sources.in,
    tablesQueryServers,
  ]);

  useEffect(() => {
    if (serversToDisplay) {
      const [defaultServer] = serversToDisplay;
      if (defaultServer) {
        onChange(defaultServer);
      }
    }
  }, [serversToDisplay, onChange]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-lg font-semibold">Processing method</h3>
        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Sets the approach for finding and retrieving information from your
          data sources. Need help? Check our guide.
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            isLoading={isMCPServerViewsLoading}
            label={
              mcpServerView
                ? getMcpServerViewDisplayName(mcpServerView)
                : "loading..."
            }
            icon={
              mcpServerView != null &&
              isInternalAllowedIcon(mcpServerView.server.icon)
                ? InternalActionIcons[mcpServerView.server.icon]
                : undefined
            }
            variant="outline"
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="max-w-100">
          {serversToDisplay &&
            serversToDisplay.map((view) => (
              <DropdownMenuItem
                key={view.id}
                label={getMcpServerViewDisplayName(view)}
                icon={getAvatar(view.server)}
                onClick={() => onChange(view)}
                description={getMcpServerViewDescription(view)}
              />
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {displayWarningTableQuery && (
        <div>
          <Chip color="info" size="sm" label=" Your tables will be ignored " />
        </div>
      )}
    </div>
  );
}
