import { Chip } from "@dust-tt/sparkle";

import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/api/mcp";
import { asDisplayName } from "@app/types";

interface MCPActionHeaderProps {
  mcpServer: MCPServerType;
  isAuthorized: boolean;
  isConnected: boolean;
  isConnectionsLoading: boolean;
}

export function MCPActionHeader({
  mcpServer,
  isAuthorized,
  isConnected,
  isConnectionsLoading,
}: MCPActionHeaderProps) {
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      {getAvatar(mcpServer, "md")}
      <div className="flex grow flex-col gap-0 pr-9">
        <h2 className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">
          {asDisplayName(mcpServer.name)}
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
