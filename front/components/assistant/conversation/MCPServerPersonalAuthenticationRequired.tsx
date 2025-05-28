import {
  ArrowPathIcon,
  Button,
  Chip,
  CloudArrowLeftRightIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useSubmitFunction } from "@app/lib/client/utils";
import { useCreatePersonalConnection } from "@app/lib/swr/mcp_servers";
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
  retryHandler,
}: {
  owner: LightWorkspaceType;
  mcpServerId: string;
  provider: OAuthProvider;
  useCase: OAuthUseCase;
  retryHandler: () => void;
}) {
  const { createPersonalConnection } = useCreatePersonalConnection(owner);

  const { submit: retry, isSubmitting: isRetrying } = useSubmitFunction(
    async () => retryHandler()
  );

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  return (
    <div className="flex flex-col gap-9">
      {isConnected ? (
        <div className="flex flex-col gap-1 sm:flex-row">
          <Chip
            color="success"
            label={"You are now connected. The agent message can be retried"}
            size="xs"
          />
          <Button
            label={`Retry`}
            variant="outline"
            size="xs"
            icon={ArrowPathIcon}
            disabled={isRetrying}
            onClick={retry}
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
          <Button
            label={`Connect`}
            variant="outline"
            size="xs"
            icon={CloudArrowLeftRightIcon}
            disabled={isConnecting}
            onClick={async () => {
              setIsConnecting(true);
              const success = await createPersonalConnection(
                mcpServerId,
                provider,
                useCase
              );
              setIsConnecting(false);
              if (!success) {
                setIsConnected(false);
              } else {
                setIsConnected(true);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
