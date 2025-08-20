import {
  Button,
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

export function ProcessingMethodSection() {
  const { mcpServerViewsWithKnowledge, isMCPServerViewsLoading } =
    useMCPServerViewsContext();
  const {
    field: { value: mcpServerView, onChange },
  } = useController<CapabilityFormData, "mcpServerView">({
    name: "mcpServerView",
  });
  const sources = useWatch<CapabilityFormData, "sources">({ name: "sources" });

  const hasOnlyTablesSelected = useMemo(() => {
    if (!sources?.in?.length) {
      return false;
    }

    return sources.in.every((item) => {
      // Check if the item is a node and has table type
      if (item.type === "node" && item.node) {
        return item.node.type === "table";
      }
      return false;
    });
  }, [sources]);

  useEffect(() => {
    if (hasOnlyTablesSelected) {
      const tableServer = mcpServerViewsWithKnowledge.find(
        (serverView) =>
          serverView.serverType === "internal" &&
          serverView.server.name === "query_tables"
      );
      if (tableServer) {
        onChange(tableServer);
      }
    }
  }, [hasOnlyTablesSelected, mcpServerViewsWithKnowledge, onChange]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-lg font-semibold">Processing method</h3>
      </div>

      <div className="space-y-2">
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

          <DropdownMenuContent>
            {mcpServerViewsWithKnowledge.map((view) => (
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
    </div>
  );
}
