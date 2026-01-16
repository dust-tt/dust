import {
  Button,
  CloudArrowLeftRightIcon,
  ContentMessage,
  InformationCircleIcon,
  Input,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerType } from "@app/lib/api/mcp";
import { useSubmitFunction } from "@app/lib/client/utils";
import {
  useCreatePersonalConnection,
  useMCPServer,
} from "@app/lib/swr/mcp_servers";
import { useUser } from "@app/lib/swr/user";
import type { LightWorkspaceType, OAuthProvider, UserType } from "@app/types";

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

  const personalAuthInputs = mcpServer?.authorization?.personalAuthInputs ?? [];
  const personalAuthDefaults =
    mcpServer?.authorization?.personalAuthDefaults ?? {};
  const [additionalInputs, setAdditionalInputs] = useState<
    Record<string, string>
  >({});
  const canConnect = personalAuthInputs.every(
    ({ extraConfigKey, required }) =>
      !required ||
      !!additionalInputs[extraConfigKey]?.trim() ||
      !!personalAuthDefaults[extraConfigKey]?.trim()
  );

  const icon = mcpServer?.icon
    ? getIcon(mcpServer.icon)
    : InformationCircleIcon;

  const onConnectClick = async (mcpServer: MCPServerType) => {
    setIsConnecting(true);

    try {
      const success = await createPersonalConnection({
        mcpServerId: mcpServer.sId,
        mcpServerDisplayName: getMcpServerDisplayName(mcpServer),
        provider,
        useCase: "personal_actions",
        scope,
        additionalInputs,
      });

      if (!success) {
        setIsConnected(false);
        return;
      }

      setIsConnected(true);
      await retry();
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
      title={
        isConnected
          ? "Connected successfully"
          : `${mcpServer && mcpServer.name ? getMcpServerDisplayName(mcpServer) : "Personal authentication required"}`
      }
      variant={isConnected ? "success" : "primary"}
      className="flex w-80 min-w-[300px] flex-col gap-3 sm:min-w-[500px]"
      icon={icon}
    >
      {isTriggeredByCurrentUser ? (
        <>
          <div className="font-sm whitespace-normal break-words text-foreground dark:text-foreground-night">
            {isConnected && "You are now connected. Automatically retrying..."}
            {!isConnected && (
              <>
                {`Your agent is trying to use ${mcpServer && mcpServer.name ? getMcpServerDisplayName(mcpServer) : "a tool"}.`}
                <br />
                <span className="font-semibold">
                  Connect your account to continue.
                </span>
              </>
            )}
          </div>
          {!isConnected && mcpServer && (
            <>
              {personalAuthInputs.map((input) => (
                <div
                  key={input.extraConfigKey}
                  className="mt-2 flex flex-col gap-2"
                >
                  {input.description && (
                    <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      {input.description}
                    </div>
                  )}
                  <Input
                    name={input.extraConfigKey}
                    placeholder={
                      input.placeholder ??
                      (input.required
                        ? input.label
                        : `${input.label} (optional)`)
                    }
                    value={additionalInputs[input.extraConfigKey] ?? ""}
                    onChange={(e) =>
                      setAdditionalInputs((prev) => ({
                        ...prev,
                        [input.extraConfigKey]: e.target.value,
                      }))
                    }
                    message={
                      personalAuthDefaults[input.extraConfigKey]
                        ? `Workspace default: ${personalAuthDefaults[input.extraConfigKey]}`
                        : undefined
                    }
                  />
                </div>
              ))}
              <div className="mt-3 flex flex-col justify-end sm:flex-row">
                <Button
                  label="Connect"
                  variant="highlight"
                  size="xs"
                  icon={CloudArrowLeftRightIcon}
                  disabled={isConnecting || !canConnect}
                  onClick={() => void onConnectClick(mcpServer)}
                />
              </div>
            </>
          )}
        </>
      ) : (
        <div className="font-sm whitespace-normal break-words text-foreground dark:text-foreground-night">
          {`${triggeringUser?.fullName} is trying to use ${mcpServer && mcpServer.name ? getMcpServerDisplayName(mcpServer) : "a tool"}.`}
          <br />
          <span className="font-semibold">
            Waiting on them to connect their account to continue...
          </span>
        </div>
      )}
    </ContentMessage>
  );
}
