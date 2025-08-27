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

import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import type { CapabilityFormData } from "@app/components/agent_builder/types";
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
  SEARCH_SERVER_NAME,
  TABLE_QUERY_SERVER_NAME,
  TABLE_QUERY_V2_SERVER_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";

const tablesServer = [TABLE_QUERY_SERVER_NAME, TABLE_QUERY_V2_SERVER_NAME];

export function ProcessingMethodSection() {
  const { mcpServerViewsWithKnowledge, isMCPServerViewsLoading } =
    useMCPServerViewsContext();
  const {
    field: { value: mcpServerView, onChange },
  } = useController<CapabilityFormData, "mcpServerView">({
    name: "mcpServerView",
  });
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });

  const { hasOnlyTablesSelected, hasSomeTablesSelected } = useMemo(() => {
    if (!sources?.in?.length) {
      return { hasOnlyTablesSelected: false, hasSomeTablesSelected: false };
    }

    let tableCount = 0;
    let totalCount = 0;

    for (const item of sources.in) {
      // Count all selectable items (nodes)
      if (item.type === "node") {
        totalCount++;
        // Check if this node is a table
        if (item.node?.type === "table") {
          tableCount++;
        }
      }
    }

    return {
      hasOnlyTablesSelected: totalCount > 0 && tableCount === totalCount,
      hasSomeTablesSelected: tableCount > 0,
    };
  }, [sources]);

  useEffect(() => {
    const needsUpdate =
      !mcpServerView ||
      (hasOnlyTablesSelected &&
        !tablesServer.includes(mcpServerView.server.name));

    if (!needsUpdate) {
      return;
    }

    if (hasOnlyTablesSelected) {
      const tableServer = mcpServerViewsWithKnowledge.find(
        (serverView) =>
          serverView.serverType === "internal" &&
          tablesServer.includes(serverView.server.name)
      );
      if (tableServer) {
        onChange(tableServer);
      }
    } else {
      const searchServer = mcpServerViewsWithKnowledge.find(
        (serverView) =>
          serverView.serverType === "internal" &&
          serverView.server.name === SEARCH_SERVER_NAME
      );
      if (searchServer) {
        onChange(searchServer);
      }
    }
  }, [
    hasOnlyTablesSelected,
    mcpServerViewsWithKnowledge,
    mcpServerView,
    onChange,
  ]);

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
            isSelect
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="max-w-100">
          {mcpServerViewsWithKnowledge
            .filter((view) =>
              hasOnlyTablesSelected
                ? tablesServer.includes(view.server.name)
                : !tablesServer.includes(view.server.name)
            )
            .map((view) => (
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
      {!hasOnlyTablesSelected && hasSomeTablesSelected && (
        <Chip color="info" size="sm" label=" Your tables will be ignored " />
      )}
    </div>
  );
}
