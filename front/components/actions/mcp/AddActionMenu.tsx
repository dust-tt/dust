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

import {
  DEFAULT_MCP_SERVER_ICON,
  MCP_SERVER_ICONS,
} from "@app/lib/actions/mcp_icons";
import {
  useAvailableMCPServers,
  useCreateInternalMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";

type AddActionMenuProps = {
  owner: WorkspaceType;
  enabledMCPServers: string[];
  createRemoteMCP: () => void;
};

export const AddActionMenu = ({
  owner,
  enabledMCPServers,
  createRemoteMCP,
}: AddActionMenuProps) => {
  const { availableMCPServers } = useAvailableMCPServers({
    owner,
  });

  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);

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
        {availableMCPServers?.length > 0 && (
          <>
            {availableMCPServers
              .filter((mcpServer) => !enabledMCPServers.includes(mcpServer.id))
              .map((mcpServer) => (
                <DropdownMenuItem
                  key={mcpServer.id}
                  label={mcpServer.name}
                  icon={
                    MCP_SERVER_ICONS[mcpServer.icon || DEFAULT_MCP_SERVER_ICON]
                  }
                  onClick={async () => {
                    await createInternalMCPServer(mcpServer.name);
                  }}
                />
              ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          icon={CloudArrowLeftRightIcon}
          label="Add MCP Server"
          onClick={createRemoteMCP}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
