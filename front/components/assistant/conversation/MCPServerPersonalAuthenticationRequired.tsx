import {
  Button,
  CloudArrowLeftRightIcon,
  ContentMessage,
  InformationCircleIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useSubmitFunction } from "@app/lib/client/utils";
import {
  useCreatePersonalConnection,
  useMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType, OAuthProvider } from "@app/types";

export function MCPServerPersonalAuthenticationRequired({
  owner,
  mcpServerId,
  provider,
  scope,
  retryHandler,
}: {
  owner: LightWorkspaceType;
  mcpServerId: string;
  provider: OAuthProvider;
  scope?: string;
  retryHandler: () => void;
}) {
  const { server: mcpServer } = useMCPServer({
    owner,
    serverId: mcpServerId,
  });
  const { createPersonalConnection } = useCreatePersonalConnection(owner);

  const { submit: retry } = useSubmitFunction(async () => retryHandler());

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  return (
    <ContentMessage
      title={
        isConnected
          ? "Connected successfully"
          : "Personal authentication required"
      }
      variant={isConnected ? "success" : "info"}
      className="flex flex-col gap-3"
      icon={InformationCircleIcon}
    >
      <div className="whitespace-normal break-words">
        {isConnected
          ? "You are now connected. Automatically retrying..."
          : "The agent took an action that requires personal authentication"}
      </div>
      {!isConnected && mcpServer && (
        <div className="flex flex-col gap-2 pt-3 sm:flex-row">
          <Button
            label="Connect"
            variant="outline"
            size="xs"
            icon={CloudArrowLeftRightIcon}
            disabled={isConnecting}
            onClick={async () => {
              setIsConnecting(true);
              const success = await createPersonalConnection(
                mcpServer,
                provider,
                "personal_actions",
                scope
              );
              setIsConnecting(false);
              if (!success) {
                setIsConnected(false);
              } else {
                setIsConnected(true);
                await retry();
              }
            }}
          />
        </div>
      )}
    </ContentMessage>
  );
}
