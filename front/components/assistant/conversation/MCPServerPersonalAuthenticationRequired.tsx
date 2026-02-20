import {
  areCredentialOverridesValid,
  PersonalAuthCredentialOverrides,
} from "@app/components/oauth/PersonalAuthCredentialOverrides";
import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerType } from "@app/lib/api/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import {
  useCreatePersonalConnection,
  useMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { OAuthProvider } from "@app/types/oauth/lib";
import { getOverridablePersonalAuthInputs } from "@app/types/oauth/lib";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { ActionCardBlock, Button } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface MCPServerPersonalAuthenticationRequiredProps {
  triggeringUser: UserType | null;
  mcpServerId: string;
  owner: LightWorkspaceType;
  provider: OAuthProvider;
  retryHandler: () => void;
  scope?: string;
}

export function MCPServerPersonalAuthenticationRequired({
  triggeringUser,
  mcpServerId,
  owner,
  provider,
  retryHandler,
  scope,
}: MCPServerPersonalAuthenticationRequiredProps) {
  const { user } = useAuth();
  const { server: mcpServer } = useMCPServer({
    owner,
    serverId: mcpServerId,
  });

  const { createPersonalConnection } = useCreatePersonalConnection(owner);

  const { submit: retry } = useSubmitFunction(async () => retryHandler());

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [overriddenCredentials, setCredentialOverrides] = useState<
    Record<string, string>
  >({});

  const overridableInputs = getOverridablePersonalAuthInputs({ provider });

  const visual = mcpServer?.icon
    ? getAvatarFromIcon(mcpServer.icon, "sm")
    : undefined;

  const serverDisplayName =
    mcpServer && mcpServer.name
      ? getMcpServerDisplayName(mcpServer)
      : undefined;

  const isTriggeredByCurrentUser = useMemo(
    () => triggeringUser?.sId === user?.sId,
    [triggeringUser, user?.sId]
  );

  const onConnectClick = async (mcpServer: MCPServerType) => {
    setIsConnecting(true);
    setConnectionError(null);

    try {
      const result = await createPersonalConnection({
        mcpServerId: mcpServer.sId,
        mcpServerDisplayName: getMcpServerDisplayName(mcpServer),
        authorization: mcpServer.authorization,
        provider,
        useCase: "personal_actions",
        scope,
        overriddenCredentials:
          Object.keys(overriddenCredentials).length > 0
            ? overriddenCredentials
            : undefined,
      });

      if (!result.success) {
        setIsConnected(false);
        if (result.error) {
          setConnectionError(result.error);
        }
      } else {
        setIsConnected(true);
        await retry();
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Determine the ActionCardBlock state.
  let cardState: "active" | "disabled" | "accepted";
  if (!isTriggeredByCurrentUser) {
    cardState = "disabled";
  } else if (isConnected) {
    cardState = "accepted";
  } else if (isConnecting) {
    cardState = "disabled";
  } else {
    cardState = "active";
  }

  const title = serverDisplayName ?? "Personal authentication required";

  // Build description based on current state.
  let description: React.ReactNode;
  if (!isTriggeredByCurrentUser) {
    description = (
      <>
        {`${triggeringUser?.fullName} is trying to use ${serverDisplayName ?? "a tool"}.`}
        <br />
        <span className="font-semibold">
          Waiting on them to connect their account to continue...
        </span>
      </>
    );
  } else if (connectionError) {
    description = connectionError;
  } else if (!isConnected) {
    description = (
      <>
        {`Your agent is trying to use ${serverDisplayName ?? "a tool"}.`}
        <br />
        <span className="font-semibold">Connect your account to continue.</span>
        {overridableInputs && mcpServer && (
          <div className="mt-2">
            <PersonalAuthCredentialOverrides
              inputs={overridableInputs}
              values={overriddenCredentials}
              idPrefix={mcpServerId}
              onChange={(key, value) =>
                setCredentialOverrides((prev) => ({
                  ...prev,
                  [key]: value,
                }))
              }
            />
          </div>
        )}
      </>
    );
  }

  // Build actions — only show Connect/Retry button for current user when not yet connected.
  const actions =
    isTriggeredByCurrentUser && !isConnected && mcpServer ? (
      <div className="flex justify-end">
        <Button
          variant="highlight"
          size="sm"
          label={connectionError ? "Retry" : "Connect"}
          disabled={
            isConnecting ||
            !areCredentialOverridesValid(
              overridableInputs,
              overriddenCredentials
            )
          }
          isLoading={isConnecting}
          onClick={() => void onConnectClick(mcpServer)}
        />
      </div>
    ) : (
      <></>
    );

  return (
    <div className="my-3">
      <ActionCardBlock
        title={title}
        visual={visual}
        state={cardState}
        acceptedTitle="Connected successfully"
        description={description}
        actions={actions}
      />
    </div>
  );
}
