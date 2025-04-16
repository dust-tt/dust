import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  PlusIcon,
  ScrollArea,
} from "@dust-tt/sparkle";
import { useState } from "react";
import React from "react";

import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/api/mcp";
import { filterMCPServer } from "@app/lib/mcp";
import { useAvailableMCPServers } from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";
import { asDisplayName } from "@app/types";

type AddActionMenuProps = {
  owner: WorkspaceType;
  enabledMCPServers: string[];
  createInternalMCPServer: (mcpServer: MCPServerType) => void;
  createRemoteMCPServer: () => void;
  setIsLoading: (isLoading: boolean) => void;
};

export const AddActionMenu = ({
  owner,
  enabledMCPServers,
  createInternalMCPServer,
  createRemoteMCPServer,
}: AddActionMenuProps) => {
  const [searchText, setSearchText] = useState("");
  const { availableMCPServers } = useAvailableMCPServers({
    owner,
  });

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          label="Add Toolset"
          variant="primary"
          icon={PlusIcon}
          size="sm"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[500px]">
        <div className="flex flex-row items-center gap-2">
          <DropdownMenuSearchbar
            className="flex-grow"
            placeholder="Search tools..."
            name="search"
            value={searchText}
            onChange={setSearchText}
          />
          <Button
            icon={PlusIcon}
            label="Add MCP Server"
            onClick={createRemoteMCPServer}
          />
        </div>
        <ScrollArea className="max-h-[500px]">
          {availableMCPServers
            .filter((mcpServer) => !enabledMCPServers.includes(mcpServer.id))
            .filter((mcpServer) => filterMCPServer(mcpServer, searchText))
            .map((mcpServer) => (
              <DropdownMenuItem
                key={mcpServer.id}
                label={asDisplayName(mcpServer.name)}
                icon={() => getAvatar(mcpServer, "xs")}
                description={mcpServer.description}
                onClick={async () => {
                  createInternalMCPServer(mcpServer);
                }}
              />
            ))}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
