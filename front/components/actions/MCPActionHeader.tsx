import { Chip } from "@dust-tt/sparkle";

import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/api/mcp";

interface MCPActionHeaderProps {
  mcpServer: MCPServerType;
  isAuthorized: boolean;
  isConnected: boolean;
  isConnectionsLoading: boolean;
  action?: AssistantBuilderActionConfiguration;
}

export function MCPActionHeader({
  mcpServer,
  isAuthorized,
  isConnected,
  isConnectionsLoading,
  action,
}: MCPActionHeaderProps) {
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      {getAvatar(mcpServer, "md")}
      <div className="flex grow flex-col gap-0 pr-9">
        <h2 className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">
          {getMcpServerDisplayName(mcpServer, action)}
        </h2>
        <div className="line-clamp-1 overflow-hidden text-sm text-muted-foreground dark:text-muted-foreground-night">
          {mcpServer.description}
        </div>
        {isAuthorized && !isConnected && !isConnectionsLoading && (
          <div>
            <Chip color="warning" size="xs">
              Requires authentication
            </Chip>
          </div>
        )}
      </div>
    </div>
  );
}
