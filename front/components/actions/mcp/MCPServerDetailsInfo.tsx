import { AuthorizationInfo } from "@app/components/actions/mcp/AuthorizationInfo";
import { RemoteMCPForm } from "@app/components/actions/mcp/RemoteMCPForm";
import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import type { LightWorkspaceType } from "@app/types";

type MCPServerDetailsInfoProps = {
  mcpServer: MCPServerType;
  owner: LightWorkspaceType;
  onFormSave: () => void;
};

export function MCPServerDetailsInfo({
  mcpServer,
  owner,
  onFormSave,
}: MCPServerDetailsInfoProps) {
  const serverType = getServerTypeAndIdFromSId(mcpServer.id).serverType;

  return (
    <div className="flex flex-col gap-2">
      <AuthorizationInfo mcpServer={mcpServer} owner={owner} />
      {serverType === "remote" && (
        <RemoteMCPForm
          mcpServer={mcpServer}
          owner={owner}
          onSave={onFormSave}
        />
      )}
      <ToolsList tools={mcpServer.tools} />
    </div>
  );
}
