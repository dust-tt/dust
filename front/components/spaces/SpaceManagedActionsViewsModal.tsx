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
import type { MCPServerType } from "@app/lib/api/mcp";
import { filterMCPServer } from "@app/lib/mcp";
import { useAvailableMCPServers } from "@app/lib/swr/mcp_servers";
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
  const { availableMCPServers, isAvailableMCPServersLoading } =
    useAvailableMCPServers({
      owner,
      space,
    });

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button label="Add Tools" variant="primary" icon={PlusIcon} size="sm" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[500px]"
        align="end"
        dropdownHeaders={
          <DropdownMenuSearchbar
            autoFocus
            className="flex-grow"
            placeholder="Search tools..."
            name="search"
            value={searchText}
            onChange={setSearchText}
            disabled={isAvailableMCPServersLoading}
          />
        }
      >
        {isAvailableMCPServersLoading && (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />{" "}
          </div>
        )}
        {!isAvailableMCPServersLoading && availableMCPServers.length <= 0 && (
          <DropdownMenuItem label="No more tools to add" disabled />
        )}
        {availableMCPServers
          .filter((s) => filterMCPServer(s, searchText))
          .map((server) => (
            <DropdownMenuItem
              key={server.sId}
              label={getMcpServerDisplayName(server)}
              icon={() => getAvatar(server, "xs")}
              description={server.description}
              onClick={() => {
                onAddServer(server);
              }}
            />
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
