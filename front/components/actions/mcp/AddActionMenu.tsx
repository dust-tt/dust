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

import { MCP_SERVER_ICONS } from "@app/lib/actions/mcp_icons";
import { useMCPServers } from "@app/lib/swr/mcp_servers";
import type { ConnectorProvider, WorkspaceType } from "@app/types";

export type DataSourceIntegration = {
  connectorProvider: ConnectorProvider;
  setupWithSuffix: string | null;
};

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
          .filter((i) => !enabledMCPServers.includes(i.id))
          .map((i) => (
            <DropdownMenuItem
              key={i.id}
              label={i.name}
              icon={MCP_SERVER_ICONS[i.icon || "Rocket"]}
              onClick={() => {}}
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
