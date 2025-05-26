import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useSendNotification,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

import { MCPServerOAuthConnexion } from "@app/components/actions/mcp/MCPServerOAuthConnexion";
import type { MCPServerType } from "@app/lib/api/mcp";
import { useCreateMCPServerConnection } from "@app/lib/swr/mcp_servers";
import type { RequiredAuthCredentials, WorkspaceType } from "@app/types";
import {
  asDisplayName,
  getProviderRequiredAuthCredentials,
  OAUTH_PROVIDER_NAMES,
  setupOAuthConnection,
} from "@app/types";

type ConnectMCPServerDialogProps = {
  owner: WorkspaceType;
  mcpServer: MCPServerType | null;
  setIsLoading: (isCreating: boolean) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

export function ConnectMCPServerDialog({
  owner,
  mcpServer,
  setIsLoading,
  isOpen = false,
  setIsOpen,
}: ConnectMCPServerDialogProps) {
  const sendNotification = useSendNotification();
  const [authCredentials, setAuthCredentials] = useState<Record<
    string,
    string
  > | null>(null);
  const [requiredCredentials, setRequiredCredentials] = useState<Record<
    string,
    RequiredAuthCredentials
  > | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const fetchCredentials = async () => {
      if (!mcpServer?.authorization) {
        return;
      }
      const credentials = await getProviderRequiredAuthCredentials(
        mcpServer.authorization
      );
      setRequiredCredentials(credentials);
      // Set the auth credentials to the values in the credentials object
      // that already have a value as we will not ask the user for these values.
      if (credentials) {
        setAuthCredentials(
          Object.entries(credentials).reduce(
            (acc, [key, { value }]) => ({ ...acc, [key]: value }),
            {}
          )
        );
      }
    };
    void fetchCredentials();
  }, [mcpServer?.authorization, setAuthCredentials]);

  const { createMCPServerConnection } = useCreateMCPServerConnection({ owner });

  const resetState = useCallback(() => {
    setIsLoading(false);
    setAuthCredentials(null);
    setErrors([]);
  }, [setIsLoading]);

  const isValidCredentials = () => {
    const erroredLabels: string[] = [];
    Object.entries(requiredCredentials ?? {}).forEach(([key, credential]) => {
      if (
        credential.isValidFunction &&
        !credential.isValidFunction(authCredentials?.[key])
      ) {
        erroredLabels.push(credential.label);
      }
    });
    setErrors(erroredLabels);
    return Object.keys(erroredLabels).length === 0;
  };

  const handleSave = async () => {
    if (!mcpServer?.authorization) {
      throw new Error(
        "MCP server has no authorization while trying to connect"
      );
    }

    setIsLoading(true);

    // First setup connection.
    const cRes = await setupOAuthConnection({
      dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
      owner,
      provider: mcpServer.authorization.provider,
      useCase: mcpServer.authorization.use_case,
      extraConfig: authCredentials ?? {},
    });
    if (cRes.isErr()) {
      sendNotification({
        type: "error",
        title: `Failed to connect ${OAUTH_PROVIDER_NAMES[mcpServer.authorization.provider]}`,
        description: cRes.error.message,
      });
    } else {
      // Then associate connection.
      await createMCPServerConnection({
        connectionId: cRes.value.connection_id,
        mcpServerId: mcpServer.sId,
        provider: mcpServer.authorization.provider,
      });
    }

    setIsLoading(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        resetState();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Connect {asDisplayName(mcpServer?.name)}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <MCPServerOAuthConnexion
            authorization={mcpServer?.authorization ?? null}
            authCredentials={authCredentials}
            setAuthCredentials={setAuthCredentials}
            requiredCredentials={requiredCredentials}
            errors={errors}
          />
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
            onClick: resetState,
          }}
          rightButtonProps={{
            label: mcpServer?.authorization ? "Save and connect" : "Save",
            variant: "primary",
            onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              if (isValidCredentials()) {
                void handleSave();
                setIsOpen(false);
              }
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
