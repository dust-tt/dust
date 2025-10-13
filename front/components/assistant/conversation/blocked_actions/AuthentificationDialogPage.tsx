import { Button, CloudArrowLeftRightIcon, cn, Icon } from "@dust-tt/sparkle";
import { useCallback } from "react";

import { getIcon } from "@app/components/resources/resources_icons";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import logger from "@app/logger/logger";
import type { OAuthProvider, OAuthUseCase } from "@app/types";

type AuthenticationRequiredBlockedAction = BlockedToolExecution & {
  status: "blocked_authentication_required";
};

type ConnectionState = "connecting" | "connected" | "idle";

interface AuthenticationDialogPageProps {
  authActions: AuthenticationRequiredBlockedAction[];
  connectionStates: Record<string, ConnectionState>;
  onConnectionStateChange: (actionId: string, status: ConnectionState) => void;
  createPersonalConnection: (params: {
    mcpServerId: string;
    mcpServerDisplayName: string;
    provider: OAuthProvider;
    useCase: OAuthUseCase;
    scope?: string;
  }) => Promise<boolean>;
  errorMessage: string | null;
}

export function AuthenticationDialogPage({
  authActions,
  connectionStates,
  onConnectionStateChange,
  createPersonalConnection,
  errorMessage,
}: AuthenticationDialogPageProps) {
  const handleConnect = useCallback(
    async (blockedAction: AuthenticationRequiredBlockedAction) => {
      onConnectionStateChange(blockedAction.actionId, "connecting");
      const success = await createPersonalConnection({
        mcpServerId: blockedAction.metadata.mcpServerId,
        mcpServerDisplayName: blockedAction.metadata.mcpServerDisplayName,
        provider: blockedAction.authorizationInfo.provider,
        useCase: "personal_actions",
        scope: blockedAction.authorizationInfo.scope,
      });
      if (success) {
        onConnectionStateChange(blockedAction.actionId, "connected");
      } else {
        logger.error(
          {
            mcpServerId: blockedAction.metadata.mcpServerId,
            mcpServerDisplayName: blockedAction.metadata.mcpServerDisplayName,
            provider: blockedAction.authorizationInfo.provider,
            scope: blockedAction.authorizationInfo.scope,
          },
          "Failed to connect to MCP server"
        );
        onConnectionStateChange(blockedAction.actionId, "idle");
      }
    },
    [createPersonalConnection, onConnectionStateChange]
  );

  return (
    <div className="flex flex-col gap-4">
      {authActions.map((blockedAction, authIndex) => {
        return (
          <div key={authIndex} className="rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex h-8 w-8 items-center justify-center">
                  {blockedAction.metadata.icon ? (
                    <Icon visual={getIcon(blockedAction.metadata.icon)} />
                  ) : null}
                </div>
                <div className="font-medium">
                  {blockedAction.metadata.mcpServerDisplayName}
                </div>
              </div>
              <Button
                label={
                  connectionStates[blockedAction.actionId] === "connected"
                    ? "Connected"
                    : "Connect"
                }
                className={cn(
                  "text-foreground dark:text-foreground-night",
                  connectionStates[blockedAction.actionId] === "connected" &&
                    "bg-green-100 hover:bg-green-100/80 dark:bg-green-100-night dark:hover:bg-green-100-night/80"
                )}
                variant="ghost"
                size="xs"
                icon={
                  connectionStates[blockedAction.actionId] === "connected"
                    ? undefined
                    : CloudArrowLeftRightIcon
                }
                disabled={
                  connectionStates[blockedAction.actionId] === "connecting" ||
                  connectionStates[blockedAction.actionId] === "connected"
                }
                isLoading={
                  connectionStates[blockedAction.actionId] === "connecting"
                }
                onClick={() => handleConnect(blockedAction)}
              />
            </div>
          </div>
        );
      })}
      {errorMessage && (
        <div className="mt-2 text-sm font-medium text-warning-800 dark:text-warning-800-night">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
