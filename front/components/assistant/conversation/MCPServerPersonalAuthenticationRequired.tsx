import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import {
  areCredentialOverridesValid,
  PersonalAuthCredentialOverrides,
} from "@app/components/oauth/PersonalAuthCredentialOverrides";
import { getAvatarFromIcon } from "@app/components/resources/resources_icons";
import { useResolveAuthentication } from "@app/hooks/useResolveAuthentication";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerType } from "@app/lib/api/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  useCreatePersonalConnection,
  useMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { OAuthProvider } from "@app/types/oauth/lib";
import { getOverridablePersonalAuthInputs } from "@app/types/oauth/lib";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { ActionCardBlock, Button, CheckIcon, XMarkIcon } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface MCPServerPersonalAuthenticationRequiredProps {
  blockedAction: BlockedToolExecution;
  triggeringUser: UserType | null;
  mcpServerId: string;
  owner: LightWorkspaceType;
  provider: OAuthProvider;
  scope?: string;
}

export function MCPServerPersonalAuthenticationRequired({
  blockedAction,
  triggeringUser,
  mcpServerId,
  owner,
  provider,
  scope,
}: MCPServerPersonalAuthenticationRequiredProps) {
  const { user } = useAuth();
  const { server: mcpServer } = useMCPServer({
    owner,
    serverId: mcpServerId,
  });

  const { createPersonalConnection } = useCreatePersonalConnection(owner);

  const { removeCompletedAction } = useBlockedActionsContext();

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [overriddenCredentials, setCredentialOverrides] = useState<
    Record<string, string>
  >({});

  const { resolveAuthentication, isResolving } = useResolveAuthentication({
    owner,
  });

  const overridableInputs = getOverridablePersonalAuthInputs({ provider });

  const visual = mcpServer?.icon
    ? getAvatarFromIcon(mcpServer.icon, "xs")
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
        return;
      }

      const completionRes = await resolveAuthentication({
        outcome: "completed",
        actionId: blockedAction.actionId,
        conversationId: blockedAction.conversationId,
        messageId: blockedAction.messageId,
      });

      if (!completionRes.success) {
        setIsConnected(false);
        return;
      }

      setIsConnected(true);
      removeCompletedAction(blockedAction.actionId);
    } finally {
      setIsConnecting(false);
    }
  };

  const onSkipClick = async () => {
    setConnectionError(null);

    const denyRes = await resolveAuthentication({
      outcome: "denied",
      actionId: blockedAction.actionId,
      conversationId: blockedAction.conversationId,
      messageId: blockedAction.messageId,
    });

    if (!denyRes.success) {
      return;
    }

    removeCompletedAction(blockedAction.actionId);
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

  const title = `${serverDisplayName ?? "Personal"} authentication`;

  // Build description based on current state.
  let description: React.ReactNode;
  if (!isTriggeredByCurrentUser) {
    description = (
      <div className="text-sm">
        {`${triggeringUser?.fullName} is trying to use ${serverDisplayName ?? "a tool"}.`}
        <br />
        <span className="font-semibold">
          Waiting on them to connect their account to continue...
        </span>
      </div>
    );
  } else if (connectionError) {
    description = connectionError;
  } else if (!isConnected) {
    description = (
      <div className="text-sm">
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
      </div>
    );
  }

  // Build actions — only show Connect/Retry button for current user when not yet connected.
  const actions =
    isTriggeredByCurrentUser && !isConnected && mcpServer ? (
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          size="xs"
          label="Skip"
          icon={XMarkIcon}
          disabled={isConnecting}
          onClick={() => void onSkipClick()}
        />
        <Button
          variant="highlight"
          size="xs"
          label={connectionError ? "Retry" : "Connect"}
          icon={CheckIcon}
          disabled={
            isConnecting ||
            !areCredentialOverridesValid(
              overridableInputs,
              overriddenCredentials
            )
          }
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
        size="compact"
        acceptedTitle="Connected successfully"
        description={description}
        actions={actions}
      />
    </div>
  );
}
