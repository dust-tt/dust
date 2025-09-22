import { useWatch } from "react-hook-form";

import type {
  AgentBuilderAction,
  MCPFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";

interface MCPActionHeaderProps {
  mcpServerView: MCPServerViewType;
  action: AgentBuilderAction;
}

export function MCPActionHeader({
  mcpServerView,
  action,
}: MCPActionHeaderProps) {
  const newName = useWatch<MCPFormData, "name">({ name: "name" });

  const newAction = {
    ...action,
    name: newName,
  };

  return (
    <div className="flex w-full flex-col items-start gap-4">
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        {getAvatar(mcpServerView.server, "md")}
        <div className="flex grow flex-col gap-0 pr-9">
          <h2 className="heading-base line-clamp-1 text-foreground dark:text-foreground-night">
            {getMcpServerViewDisplayName(mcpServerView, newAction)}
          </h2>
          <p className="overflow-hidden text-sm text-muted-foreground dark:text-muted-foreground-night">
            {mcpServerView.server.description}
          </p>
        </div>
      </div>
    </div>
  );
}
