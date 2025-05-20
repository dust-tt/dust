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

import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/api/mcp";
import { filterMCPServer } from "@app/lib/mcp";
import { useAvailableMCPServers } from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";
import { asDisplayName } from "@app/types";

type AddActionMenuProps = {
  owner: WorkspaceType;
  enabledMCPServers: string[];
  buttonVariant?: "primary" | "outline";
  createInternalMCPServer: (mcpServer: MCPServerType) => void;
  createRemoteMCPServer: () => void;
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
          className="flex-grow"
          placeholder="Search tools..."
          name="search"
          value={searchText}
          onChange={setSearchText}
          disabled={isAvailableMCPServersLoading}
          button={
            <Button
              icon={PlusIcon}
              label="Add MCP Server"
              onClick={createRemoteMCPServer}
            />
          }
        />
        {isAvailableMCPServersLoading && (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />{" "}
          </div>
        )}
        {availableMCPServers
          .filter((mcpServer) => !enabledMCPServers.includes(mcpServer.sId))
          .filter((mcpServer) => filterMCPServer(mcpServer, searchText))
          .map((mcpServer) => (
            <DropdownMenuItem
              key={mcpServer.sId}
              label={asDisplayName(mcpServer.name)}
              icon={() => getAvatar(mcpServer, "xs")}
              description={mcpServer.description}
              onClick={async () => {
                createInternalMCPServer(mcpServer);
              }}
            />
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
