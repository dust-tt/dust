import {
  Button,
  CloudArrowLeftRightIcon,
  ContentMessage,
  InformationCircleIcon,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import {
  areCredentialOverridesValid,
  PersonalAuthCredentialOverrides,
} from "@app/components/oauth/PersonalAuthCredentialOverrides";
import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerType } from "@app/lib/api/mcp";
import { useSubmitFunction } from "@app/lib/client/utils";
import {
  useCreatePersonalConnection,
  useMCPServer,
} from "@app/lib/swr/mcp_servers";
import { useUser } from "@app/lib/swr/user";
import type { OAuthProvider } from "@app/types/oauth/lib";
import { getOverridablePersonalAuthInputs } from "@app/types/oauth/lib";
import type { LightWorkspaceType, UserType } from "@app/types/user";

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
  const { user } = useUser();
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

  const icon = mcpServer?.icon
    ? getIcon(mcpServer.icon)
    : InformationCircleIcon;

  const serverDisplayName =
    mcpServer && mcpServer.name
      ? getMcpServerDisplayName(mcpServer)
      : undefined;

  function getContentMessageTitle(): string {
    if (isConnected) {
      return "Connected successfully";
    }
    if (connectionError) {
      return "Connection failed";
    }
    return serverDisplayName ?? "Personal authentication required";
  }

  function getContentMessageVariant(): "success" | "warning" | "primary" {
    if (isConnected) {
      return "success";
    }
    if (connectionError) {
      return "warning";
    }
    return "primary";
  }

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

  const isTriggeredByCurrentUser = useMemo(
    () => triggeringUser?.sId === user?.sId,
    [triggeringUser, user?.sId]
  );

  return (
    <ContentMessage
      title={getContentMessageTitle()}
      variant={getContentMessageVariant()}
      className="flex w-80 min-w-[300px] flex-col gap-3 sm:min-w-[500px]"
      icon={icon}
    >
      {isTriggeredByCurrentUser ? (
        <>
          <div className="font-sm whitespace-normal break-words text-foreground dark:text-foreground-night">
            {isConnected && "You are now connected. Automatically retrying..."}
            {!isConnected && connectionError && <>{connectionError}</>}
            {!isConnected && !connectionError && (
              <>
                {`Your agent is trying to use ${serverDisplayName ?? "a tool"}.`}
                <br />
                <span className="font-semibold">
                  Connect your account to continue.
                </span>
              </>
            )}
          </div>
          {!isConnected && mcpServer && (
            <>
              {overridableInputs && (
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
              <div className="mt-3 flex flex-col justify-end sm:flex-row">
                <Button
                  label="Connect"
                  variant="highlight"
                  size="xs"
                  icon={CloudArrowLeftRightIcon}
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
            </>
          )}
        </>
      ) : (
        <div className="font-sm whitespace-normal break-words text-foreground dark:text-foreground-night">
          {`${triggeringUser?.fullName} is trying to use ${serverDisplayName ?? "a tool"}.`}
          <br />
          <span className="font-semibold">
            Waiting on them to connect their account to continue...
          </span>
        </div>
      )}
    </ContentMessage>
  );
}
