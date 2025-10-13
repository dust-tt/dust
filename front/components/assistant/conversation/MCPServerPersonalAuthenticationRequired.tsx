import {
  Button,
  CloudArrowLeftRightIcon,
  ContentMessage,
  InformationCircleIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import { useSubmitFunction } from "@app/lib/client/utils";
import {
  useCreatePersonalConnection,
  useMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType, OAuthProvider } from "@app/types";

interface MCPServerPersonalAuthenticationRequiredProps {
  mcpServerId: string;
  owner: LightWorkspaceType;
  provider: OAuthProvider;
  retryHandler: () => void;
  scope?: string;
}

export function MCPServerPersonalAuthenticationRequired({
  mcpServerId,
  owner,
  provider,
  retryHandler,
  scope,
}: MCPServerPersonalAuthenticationRequiredProps) {
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
          : "The agent took an action that requires personal authentication."}
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
            }}
          />
        </div>
      )}
    </ContentMessage>
  );
}
