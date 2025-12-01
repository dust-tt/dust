import { ContentMessage, InformationCircleIcon } from "@dust-tt/sparkle";

import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import { useMCPServer } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";

interface MCPServerPersonalAuthenticationDeclinedProps {
  mcpServerId: string;
  owner: LightWorkspaceType;
}

export function MCPServerPersonalAuthenticationDeclined({
  mcpServerId,
  owner,
}: MCPServerPersonalAuthenticationDeclinedProps) {
  const { server: mcpServer } = useMCPServer({
    owner,
    serverId: mcpServerId,
  });

  const icon = mcpServer?.icon
    ? getIcon(mcpServer.icon)
    : InformationCircleIcon;

  return (
    <ContentMessage
      title={`${mcpServer && mcpServer.name ? getMcpServerDisplayName(mcpServer) : "Personal authentication declined"}`}
      variant="info"
      className="flex w-80 flex-col gap-3"
      icon={icon}
    >
      <p className="font-sm">
        You declined to connect your account to this tool.
      </p>
    </ContentMessage>
  );
}
