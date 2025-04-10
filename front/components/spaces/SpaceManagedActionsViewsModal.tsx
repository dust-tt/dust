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

import {
  DEFAULT_MCP_SERVER_ICON,
  MCP_SERVER_ICONS,
} from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/api/mcp";
import { filterMCPServer } from "@app/lib/mcp";
import { useMCPServerViewsNotActivated } from "@app/lib/swr/mcp_server_views";
import type { LightWorkspaceType, SpaceType } from "@app/types";

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
  const { serverViews } = useMCPServerViewsNotActivated({
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
          {serverViews.length <= 0 && (
            <DropdownMenuItem label="No more actions to add" disabled />
          )}
          {serverViews
            .filter((s) => filterMCPServer(s.server, searchText))
            .map((serverView) => (
              <DropdownMenuItem
                key={serverView.id}
                label={serverView.server.name}
                icon={() => (
                  <Avatar
                    visual={React.createElement(
                      MCP_SERVER_ICONS[
                        serverView.server.icon || DEFAULT_MCP_SERVER_ICON
                      ]
                    )}
                    size="xs"
                  />
                )}
                description={serverView.server.description}
                onClick={() => {
                  onAddServer(serverView.server);
                }}
              />
            ))}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
