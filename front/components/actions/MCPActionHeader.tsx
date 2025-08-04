import type { AssistantBuilderMCPConfiguration } from "@app/components/assistant_builder/types";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";

interface MCPActionHeaderProps {
  mcpServerView: MCPServerViewType;
  action?: AssistantBuilderMCPConfiguration;
}

export function MCPActionHeader({
  mcpServerView,
  action,
}: MCPActionHeaderProps) {
  return (
    <div className="items-top flex flex-col gap-3 sm:flex-row">
      {getAvatar(mcpServerView.server, "md")}
      <div className="flex grow flex-col gap-0 pr-9">
        <h2 className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">
          {getMcpServerViewDisplayName(mcpServerView, action)}
        </h2>
        <div className="line-clamp-1 overflow-hidden text-sm text-muted-foreground dark:text-muted-foreground-night">
          {getMcpServerViewDescription(mcpServerView)}
        </div>
      </div>
    </div>
  );
}
