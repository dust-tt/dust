import type { AssistantBuilderMCPConfiguration } from "@app/components/assistant_builder/types";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/api/mcp";

interface MCPActionHeaderProps {
  mcpServer: MCPServerType;
  action?: AssistantBuilderMCPConfiguration;
}

export function MCPActionHeader({ mcpServer, action }: MCPActionHeaderProps) {
  return (
    <div className="items-top flex flex-col gap-3 sm:flex-row">
      {getAvatar(mcpServer, "md")}
      <div className="flex grow flex-col gap-0 pr-9">
        <h2 className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">
          {getMcpServerDisplayName(mcpServer, action)}
        </h2>
        <div className="line-clamp-1 overflow-hidden text-sm text-muted-foreground dark:text-muted-foreground-night">
          {mcpServer.description}
        </div>
      </div>
    </div>
  );
}
