import {
  Button,
  CloudArrowLeftRightIcon,
  ContentMessage,
  InformationCircleIcon,
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

  const icon = mcpServer?.icon
    ? getIcon(mcpServer.icon)
    : InformationCircleIcon;

  const onConnectClick = async (mcpServer: MCPServerType) => {
    setIsConnecting(true);

    const success = await createPersonalConnection({
      mcpServerId: mcpServer.sId,
      mcpServerDisplayName: getMcpServerDisplayName(mcpServer),
      provider,
      useCase: "personal_actions",
      scope,
    });

    setIsConnecting(false);

    if (!success) {
      setIsConnected(false);
    } else {
      setIsConnected(true);
      await retry();
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
            <div className="mt-3 flex flex-col justify-end sm:flex-row">
              <Button
                label="Connect"
                variant="highlight"
                size="xs"
                icon={CloudArrowLeftRightIcon}
                disabled={isConnecting}
                onClick={() => void onConnectClick(mcpServer)}
              />
            </div>
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
