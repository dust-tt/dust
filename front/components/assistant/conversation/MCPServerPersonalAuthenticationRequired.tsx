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

  return (
    <div className="flex flex-col gap-9">
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
          onClick={async () => {
            const success = await createPersonalConnection(
              mcpServerId,
              provider,
              useCase
            );
            if (!success) {
              setIsConnected(false);
            } else {
              setIsConnected(true);
            }
          }}
        />
      </div>
      {isConnected ? (
        <div>
          <Button
            variant="outline"
            size="sm"
            icon={ArrowPathIcon}
            label="Retry"
            onClick={retry}
            disabled={isRetrying}
          />
        </div>
      ) : null}
    </div>
  );
}
