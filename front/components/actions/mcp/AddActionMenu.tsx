import {
  Button,
  CloudArrowLeftRightIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PlusIcon,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

import {
  DEFAULT_MCP_SERVER_ICON,
  MCP_SERVER_ICONS,
} from "@app/lib/actions/mcp_icons";
import {
  useCreateInternalMCPServer,
  useMCPServers,
} from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import type { WorkspaceType } from "@app/types";

type AddActionMenuProps = {
  owner: WorkspaceType;
  enabledMCPServers: string[];
};

export const AddActionMenu = ({
  owner,
  enabledMCPServers,
}: AddActionMenuProps) => {
  const { mcpServers } = useMCPServers({
    owner,
    filter: "internal",
  });
  const { spaces } = useSpacesAsAdmin({ workspaceId: owner.sId });
  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

  const systemSpace = useMemo(() => {
    return spaces.find((space) => space.kind === "system");
  }, [spaces]);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          label="Add action"
          variant="primary"
          icon={PlusIcon}
          size="sm"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel label="Default actions" />

        {mcpServers
          .filter((mcpServer) => !enabledMCPServers.includes(mcpServer.id))
          .map((mcpServer) => (
            <DropdownMenuItem
              key={mcpServer.id}
              label={mcpServer.name}
              icon={MCP_SERVER_ICONS[mcpServer.icon || DEFAULT_MCP_SERVER_ICON]}
              onClick={async () => {
                if (!systemSpace) {
                  throw new Error("System space not found");
                }
                await createInternalMCPServer(mcpServer.id);
              }}
            />
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={CloudArrowLeftRightIcon}
          label="Add Remote MCP Server"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
