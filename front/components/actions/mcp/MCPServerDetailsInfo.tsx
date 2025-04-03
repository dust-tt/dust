import { Button, useSendNotification } from "@dust-tt/sparkle";
import { useState } from "react";

import { AuthorizationInfo } from "@app/components/actions/mcp/AuthorizationInfo";
import { RemoteMCPForm } from "@app/components/actions/mcp/RemoteMCPForm";
import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import {
  useRemoteMCPForm,
  validateFormState,
} from "@app/components/actions/mcp/useRemoteMCPForm";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import {
  useMCPServers,
  useRemoteMCPServer,
  useSyncRemoteMCPServer,
  useUpdateRemoteMCPServer,
} from "@app/lib/swr/mcp_servers";
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

  const { formState, dispatch, sharedSecret } = useRemoteMCPForm(mcpServer);

  const sendNotification = useSendNotification();
  const [serverState, setServerState] = useState<
    "idle" | "saving" | "synchronizing"
  >("idle");

  const { mutateMCPServers } = useMCPServers({
    owner,
    disabled: true,
  });

  // Use the serverId from state for the hooks
  const { updateServer } = useUpdateRemoteMCPServer(owner, mcpServer.id);
  const { syncServer } = useSyncRemoteMCPServer(owner, mcpServer.id);

  //   // Only fetch the server data if we don't already have it from the mcpServer prop
  const { mutateMCPServer } = useRemoteMCPServer({
    owner,
    serverId: mcpServer?.id || "",
    disabled: !mcpServer,
  });
  const handleSubmit = async () => {
    dispatch({ type: "VALIDATE" });
    const validation = validateFormState(formState);

    if (!validation.isValid) {
      return;
    }

    setServerState("saving");
    try {
      await updateServer({
        name: formState.name,
        url: formState.url,
        description: formState.description,
        tools: formState.tools,
      });

      void mutateMCPServer();
      void mutateMCPServers();

      sendNotification({
        title: "MCP server updated",
        type: "success",
        description: "The MCP server has been successfully updated.",
      });
    } catch (err) {
      sendNotification({
        title: "Error updating MCP server",
        type: "error",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setServerState("idle");
    }
  };

  const handleSynchronize = async () => {
    setServerState("synchronizing");
    try {
      const result = await syncServer();

      if (result.success) {
        sendNotification({
          title: "Success",
          type: "success",
          description: "MCP server synchronized successfully.",
        });
      } else {
        throw new Error("Failed to synchronize MCP server");
      }
    } catch (error) {
      sendNotification({
        title: "Error synchronizing MCP server",
        type: "error",
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    } finally {
      void mutateMCPServers();
      setServerState("idle");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <AuthorizationInfo mcpServer={mcpServer} owner={owner} />
      {serverType === "remote" && (
        <>
          <RemoteMCPForm
            isSynchronized
            state={formState}
            dispatch={dispatch}
            isConfigurationLoading={false}
            onSynchronize={handleSynchronize}
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
