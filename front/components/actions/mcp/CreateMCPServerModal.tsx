import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { MCPServerType } from "@app/lib/api/mcp";
import {
  useCreateInternalMCPServer,
  useCreateMCPServerConnection,
  useCreateRemoteMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { WorkspaceType } from "@app/types";
import {
  OAUTH_PROVIDER_NAMES,
  setupOAuthConnection,
  validateUrl,
} from "@app/types";

type RemoteMCPServerDetailsProps = {
  owner: WorkspaceType;
  internalMCPServer?: MCPServerType;
  setMCPServer: (server: MCPServerType) => void;
  setIsLoading: (isCreating: boolean) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

export function CreateMCPServerModal({
  owner,
  internalMCPServer,
  setMCPServer,
  setIsLoading,
  isOpen = false,
  setIsOpen,
}: RemoteMCPServerDetailsProps) {
  const sendNotification = useSendNotification();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [authorization, setAuthorization] = useState<AuthorizationInfo | null>(
    null
  );

  const { createWithUrlSync } = useCreateRemoteMCPServer(owner);
  const { createMCPServerConnection } = useCreateMCPServerConnection({ owner });

  const { createInternalMCPServer } = useCreateInternalMCPServer(owner);
  useEffect(() => {
    if (internalMCPServer) {
      setAuthorization(internalMCPServer.authorization);
    } else {
      setAuthorization(null);
    }
  }, [internalMCPServer]);

  const handleSave = async (e: Event) => {
    if (internalMCPServer) {
      setIsLoading(true);

      if (authorization) {
        // First setup connection
        const cRes = await setupOAuthConnection({
          dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
          owner,
          provider: authorization.provider,
          useCase: authorization.use_case,
          extraConfig: {},
        });
        if (cRes.isErr()) {
          sendNotification({
            type: "error",
            title: `Failed to connect ${OAUTH_PROVIDER_NAMES[authorization.provider]}`,
            description: cRes.error.message,
          });
          return;
        }

        // If ok, create server
        const createServerRes = await createInternalMCPServer(
          internalMCPServer.name,
          true
        );

        // Then associate connection
        if (createServerRes.success) {
          await createMCPServerConnection({
            connectionId: cRes.value.connection_id,
            mcpServerId: createServerRes.server.id,
          });
        } else {
          sendNotification({
            type: "error",
            title: "Failed to create MCP server",
          });
        }
      } else {
        await createInternalMCPServer(internalMCPServer.name, true);
      }
      setIsLoading(false);
      return;
    } else {
      // TODO: Handle Authorization for remote servers

      const urlValidation = validateUrl(url);

      if (!urlValidation.valid) {
        e.preventDefault();
        setError(
          "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c))."
        );
        return;
      }

      try {
        setIsLoading(true);
        const result = await createWithUrlSync(url, true);

        if (result.success) {
          sendNotification({
            title: "Success",
            type: "success",
            description: "MCP server synchronized successfully.",
          });
          setMCPServer(result.server);
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
        setIsLoading(false);
        setError(null);
        setUrl("");
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {internalMCPServer ? "Add Toolset" : "Add MCP Server"}
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          {!internalMCPServer && (
            <div className="space-y-2">
              <Label htmlFor="url">URL</Label>
              <div className="flex space-x-2">
                <div className="flex-grow">
                  <Input
                    id="url"
                    placeholder="https://example.com/api/mcp"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    isError={!!error}
                    message={error}
                    autoFocus
                  />
                </div>
              </div>
            </div>
          )}
          {authorization && (
            <div className="flex flex-col items-center gap-2">
              <Label className="self-start">
                This toolset requires authentication with{" "}
                {OAUTH_PROVIDER_NAMES[authorization.provider]}.
              </Label>
              <span className="w-full font-semibold text-red-500">
                Authentication credentials will be shared by all users of this
                workspace when they use this action.
              </span>
            </div>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
            onClick: () => {
              setUrl("");
              setError(null);
            },
          }}
          rightButtonProps={{
            label: authorization ? "Save and connect" : "Save",
            variant: "primary",
            onClick: handleSave,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
