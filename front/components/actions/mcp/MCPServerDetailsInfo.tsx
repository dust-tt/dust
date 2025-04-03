import { Button } from "@dust-tt/sparkle";

import { AuthorizationInfo } from "@app/components/actions/mcp/AuthorizationInfo";
import { RemoteMCPForm } from "@app/components/actions/mcp/RemoteMCPForm";
import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import { useRemoteMCPForm } from "@app/components/actions/mcp/useRemoteMCPForm";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import type { LightWorkspaceType } from "@app/types";

type MCPServerDetailsInfoProps = {
  mcpServer: MCPServerType;
  owner: LightWorkspaceType;
};

export function MCPServerDetailsInfo({
  mcpServer,
  owner,
}: MCPServerDetailsInfoProps) {
  const serverType = getServerTypeAndIdFromSId(mcpServer.id).serverType;

  const {
    formState,
    dispatch,
    serverState,
    sharedSecret,
    handleSubmit,
    handleSynchronize,
  } = useRemoteMCPForm(owner, mcpServer);

  return (
    <div className="flex flex-col gap-2">
      <AuthorizationInfo mcpServer={mcpServer} owner={owner} />
      {serverType === "remote" && (
        <>
          <RemoteMCPForm
            state={formState}
            dispatch={dispatch}
            isConfigurationLoading={false}
            onSynchronize={handleSynchronize}
            isSynchronized={true}
            sharedSecret={sharedSecret}
            isSynchronizing={serverState === "synchronizing"}
          />
          <div className="flex flex-col items-center gap-2">
            <Button
              label="Save"
              onClick={async (event: Event) => {
                event.preventDefault();
                await handleSubmit();
              }}
            />
          </div>
        </>
      )}
      <ToolsList tools={mcpServer.tools} />
    </div>
  );
}
