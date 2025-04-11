import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  PlusIcon,
  ScrollArea,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import { getVisual } from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/api/mcp";
import { filterMCPServer } from "@app/lib/mcp";
import { useAvailableMCPServers } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import { asDisplayName } from "@app/types";

type SpaceManagedActionsViewsModelProps = {
  owner: LightWorkspaceType;
  space: SpaceType;
  onAddServer: (server: MCPServerType) => void;
};

export default function SpaceManagedActionsViewsModel({
  owner,
  space,
  onAddServer,
}: SpaceManagedActionsViewsModelProps) {
  const [searchText, setSearchText] = useState("");
  const { availableMCPServers } = useAvailableMCPServers({
    owner,
    space,
  });

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          label="Add Action"
          variant="primary"
          icon={PlusIcon}
          size="sm"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-[500px]">
        <div className="flex flex-row items-center gap-2">
          <DropdownMenuSearchbar
            className="flex-grow"
            placeholder="Search actions..."
            name="search"
            value={searchText}
            onChange={setSearchText}
          />
        </div>
        <ScrollArea className="max-h-[500px]">
          {availableMCPServers.length <= 0 && (
            <DropdownMenuItem label="No more actions to add" disabled />
          )}
          {availableMCPServers
            .filter((s) => filterMCPServer(s, searchText))
            .map((server) => (
              <DropdownMenuItem
                key={server.id}
                label={asDisplayName(server.name)}
                icon={() => <Avatar visual={getVisual(server)} size="xs" />}
                description={server.description}
                onClick={() => {
                  onAddServer(server);
                }}
              />
            ))}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
