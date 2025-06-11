import { Button, Chip, CloudArrowLeftRightIcon } from "@dust-tt/sparkle";
import { useState } from "react";

import { useSubmitFunction } from "@app/lib/client/utils";
import {
  useCreatePersonalConnection,
  useMCPServer,
} from "@app/lib/swr/mcp_servers";
import type {
  LightWorkspaceType,
  OAuthProvider,
  OAuthUseCase,
} from "@app/types";

export function MCPServerPersonalAuthenticationRequired({
  owner,
  mcpServerId,
  provider,
  useCase,
  scope,
  retryHandler,
}: {
  owner: LightWorkspaceType;
  mcpServerId: string;
  provider: OAuthProvider;
  useCase: OAuthUseCase;
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
    <div className="flex flex-col gap-9">
      {isConnected ? (
        <div className="flex flex-col gap-1 sm:flex-row">
          <Chip
            color="success"
            label={"You are now connected. Automatically retrying..."}
            size="xs"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1 sm:flex-row">
          <Chip
            color="info"
            label={
              "The agent took an action that requires personal authentication"
            }
            size="xs"
          />
          {mcpServer && (
            <Button
              label={`Connect`}
              variant="outline"
              size="xs"
              icon={CloudArrowLeftRightIcon}
              disabled={isConnecting}
              onClick={async () => {
                setIsConnecting(true);
                const success = await createPersonalConnection(
                  mcpServer,
                  provider,
                  useCase,
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
          )}
        </div>
      )}
    </div>
  );
}
