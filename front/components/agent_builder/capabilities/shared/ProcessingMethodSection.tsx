import {
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Hoverable,
} from "@dust-tt/sparkle";
import { useEffect, useMemo } from "react";
import React from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

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

function isTableItem(item: DataSourceBuilderTreeItemType): boolean {
  return item.type === "node" && item.node.type === "table";
}

function isRemoteDatabaseOrTableItem(
  item: DataSourceBuilderTreeItemType
): boolean {
  return isRemoteDatabaseItem(item) || isTableItem(item);
}

function isNonTableDataItem(item: DataSourceBuilderTreeItemType): boolean {
  return (
    (item.type === "data_source" &&
      !isRemoteDatabase(item.dataSourceView.dataSource)) ||
    (item.type === "node" &&
      item.node.type !== "table" &&
      !isRemoteDatabase(item.node.dataSourceView.dataSource))
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
  const { setValue } = useFormContext<CapabilityFormData>();
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });

  const [serversToDisplay, warningContent] = useMemo((): [
    MCPServerViewTypeWithLabel[] | null,
    React.ReactNode | null,
  ] => {
    if (sources.in.length <= 0) {
      return [null, null];
    }

    // Check if current server selection creates a warning condition
    let warning: React.ReactNode | null = null;

    if (mcpServerView) {
      const isTableOrWarehouseServer =
        tablesServer.includes(mcpServerView.server.name) ||
        mcpServerView.server.name === DATA_WAREHOUSE_SERVER_NAME;

      if (isTableOrWarehouseServer) {
        // Warning for tables query or data warehouse servers with non-table data
        if (sources.in.some(isNonTableDataItem)) {
          warning = (
            <>
              <strong>{getMcpServerViewDisplayName(mcpServerView)}</strong> will
              ignore text documents and files in your selection. Create a
              separated knowledge tools if you need both.
            </>
          );
        }
      } else {
        // Warning for non-table servers with only remote databases and/or tables
        if (sources.in.every(isRemoteDatabaseOrTableItem)) {
          warning = (
            <>
              <strong>{getMcpServerViewDisplayName(mcpServerView)}</strong> will
              ignore tables in your selection. Switch processing method if you
              want to use your structured data.
            </>
          );
        }
      }
    }

    return [mcpServerViewsWithKnowledge, warning];
  }, [mcpServerViewsWithKnowledge, sources.in, mcpServerView]);

  useEffect(() => {
    if (serversToDisplay) {
      let suggestedServer = serversToDisplay[0];
      // If all selected sources are tables or remote databases, suggest
      // table query method
      if (
        sources.in.length > 0 &&
        sources.in.every(isRemoteDatabaseOrTableItem)
      ) {
        const tableQueryServer = serversToDisplay.find(
          (server) =>
            tablesServer.includes(server.server.name) ||
            server.server.name === DATA_WAREHOUSE_SERVER_NAME
        );
        if (tableQueryServer) {
          suggestedServer = tableQueryServer;
        }
      }

      if (suggestedServer) {
        setValue("mcpServerView", suggestedServer, { shouldDirty: true });
      }
    }
  }, [serversToDisplay, setValue, mcpServerView, sources.in]);

  return (
    <div className="mt-2 flex flex-col space-y-4">
      <div>
        <h3 className="mb-2 text-lg font-semibold">Processing method</h3>
        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Sets the approach for finding and retrieving information from your
          data sources. Need help? Check our{" "}
          <Hoverable
            variant="primary"
            href="https://docs.dust.tt/docs/knowledge"
            target="_blank"
          >
            guide.
          </Hoverable>
        </span>
      </div>

      <div>
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
              variant="primary"
              isSelect
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
      </div>

      <span className="text-sm text-muted-foreground dark:text-muted-foreground">
        {mcpServerView?.server.description}
      </span>

      {warningContent && (
        <div>
          <ContentMessage variant="info" size="lg">
            {warningContent}
          </ContentMessage>
        </div>
      )}
    </div>
  );
}
