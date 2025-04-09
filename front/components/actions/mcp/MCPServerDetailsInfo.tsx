import { RemoteMCPForm } from "@app/components/actions/mcp/RemoteMCPForm";
import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { LightWorkspaceType } from "@app/types";
type MCPServerDetailsInfoProps = {
  mcpServer: MCPServerType;
  owner: LightWorkspaceType;
  onClose: () => void;
};

export function MCPServerDetailsInfo({
  mcpServer,
  owner,
  onClose,
}: MCPServerDetailsInfoProps) {
  const serverType = getServerTypeAndIdFromSId(mcpServer.id).serverType;
  return (
    <div className="flex flex-col gap-2">
      {serverType === "remote" && (
        <RemoteMCPForm mcpServer={mcpServer} owner={owner} onSave={onClose} />
      )}
      <ToolsList
        owner={owner}
        tools={mcpServer.tools}
        serverType={serverType}
        serverId={mcpServer.id}
      />
    </div>
  );
}
