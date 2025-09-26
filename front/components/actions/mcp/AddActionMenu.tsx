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
import { useEffect, useState } from "react";

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
  enabledMCPServers: MCPServerType[];
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

  const [portalContainer, setPortalContainer] = useState<
    HTMLElement | undefined
  >(undefined);
  useEffect(() => {
    if (typeof document !== "undefined") {
      setPortalContainer(document.body);
    }
  }, []);

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
      <DropdownMenuContent
        className="w-[500px] px-2"
        mountPortalContainer={portalContainer}
      >
        <div className="flex items-center">
          <DropdownMenuSearchbar
            className="flex-grow items-center gap-14"
            placeholder="Search tools..."
            name="search"
            value={searchText}
            onChange={setSearchText}
            disabled={isAvailableMCPServersLoading}
          />
          <Button
            icon={PlusIcon}
            label="Add MCP Server"
            // Empty call is required given onClick passes a MouseEvent
            onClick={() => createRemoteMCPServer()}
            size="sm"
          />
        </div>
        {isAvailableMCPServersLoading && (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />{" "}
          </div>
        )}
        {availableMCPServers
          .filter((mcpServer) => mcpServer.availability === "manual")
          .filter(
            (mcpServer) =>
              mcpServer.allowMultipleInstances ||
              !enabledMCPServers.some(
                // The comparison by names here is safe because names are shared between multiple instance of the same MCP server (sIds are not).
                (enabledMCPServer) => enabledMCPServer.name === mcpServer.name
              )
          )
          .filter((mcpServer) => filterMCPServer(mcpServer, searchText))
          .map((mcpServer) => (
            <DropdownMenuItem
              key={mcpServer.sId}
              label={getMcpServerDisplayName(mcpServer)}
              icon={() => getAvatar(mcpServer, "xs")}
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
