import { RemoteMCPForm } from "@app/components/actions/mcp/RemoteMCPForm";
import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import {
  getServerTypeAndIdFromSId,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { LightWorkspaceType } from "@app/types";

type MCPServerDetailsInfoProps = {
  mcpServer: MCPServerType;
  owner: LightWorkspaceType;
};

export function MCPServerDetailsInfo({
  mcpServer,
  owner,
}: MCPServerDetailsInfoProps) {
  const serverType = getServerTypeAndIdFromSId(mcpServer.sId).serverType;
  return (
    <div className="flex flex-col gap-2">
      {isRemoteMCPServerType(mcpServer) && (
        <RemoteMCPForm mcpServer={mcpServer} owner={owner} />
      )}
      <h3 className="heading-base mb-4 font-semibold text-foreground dark:text-foreground-night">
        Available Tools
      </h3>
      <ToolsList
        owner={owner}
        tools={mcpServer.tools}
        serverType={serverType}
        serverId={mcpServer.sId}
        canUpdate={owner.role === "admin"}
      />
    </div>
  );
}
