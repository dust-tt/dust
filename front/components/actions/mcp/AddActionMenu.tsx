import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import { getDefaultRemoteMCPServerByName } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { MCPServerType } from "@app/lib/api/mcp";
import { filterMCPServer } from "@app/lib/mcp";
import { useAvailableMCPServers } from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";

type AddActionMenuProps = {
  owner: WorkspaceType;
  enabledMCPServers: { id: string; name: string }[];
  buttonVariant?: "primary" | "outline";
  createInternalMCPServer: (mcpServer: MCPServerType) => void;
  createRemoteMCPServer: (
    defaultServerConfig?: DefaultRemoteMCPServerConfig
  ) => void;
  setIsLoading: (isLoading: boolean) => void;
};

export const AddActionMenu = ({
  owner,
  enabledMCPServers,
  createInternalMCPServer,
  createRemoteMCPServer,
  buttonVariant = "primary",
}: AddActionMenuProps) => {
  const [searchText, setSearchText] = useState("");
  const { availableMCPServers, isAvailableMCPServersLoading } =
    useAvailableMCPServers({
      owner,
    });

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          label="Add Tools"
          variant={buttonVariant}
          icon={PlusIcon}
          size="sm"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[500px]">
        <DropdownMenuSearchbar
          className="flex-grow items-center gap-14"
          placeholder="Search tools..."
          name="search"
          value={searchText}
          onChange={setSearchText}
          disabled={isAvailableMCPServersLoading}
          button={
            <Button
              icon={PlusIcon}
              label="Add MCP Server"
              // Empty call is required given onClick passes a MouseEvent
              onClick={() => createRemoteMCPServer()}
              size="xs"
            />
          }
        />
        {isAvailableMCPServersLoading && (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />{" "}
          </div>
        )}
        {availableMCPServers
          .filter(
            (mcpServer) =>
              !enabledMCPServers.some((enabled) => enabled.id === mcpServer.sId)
          )
          .filter((mcpServer) => filterMCPServer(mcpServer, searchText))
          .map((mcpServer) => (
            <DropdownMenuItem
              key={mcpServer.sId}
              label={getMcpServerDisplayName(mcpServer)}
              icon={() => getAvatar(mcpServer, "xs")}
              description={mcpServer.description}
              onClick={async () => {
                const remoteMcpServer = getDefaultRemoteMCPServerByName(
                  mcpServer.name
                );
                if (remoteMcpServer) {
                  createRemoteMCPServer(remoteMcpServer);
                } else {
                  createInternalMCPServer(mcpServer);
                }
              }}
            />
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
