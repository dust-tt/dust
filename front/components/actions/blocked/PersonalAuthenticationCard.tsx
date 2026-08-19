import {
  areCredentialOverridesValid,
  PersonalAuthCredentialOverrides,
} from "@app/components/oauth/PersonalAuthCredentialOverrides";
import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import type { MCPServerType } from "@app/lib/api/mcp";
import {
  useCreatePersonalConnection,
  useMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { OAuthProvider } from "@app/types/oauth/lib";
import { getOverridablePersonalAuthInputs } from "@app/types/oauth/lib";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Avatar, Button, Card, Check, Key01, XClose } from "@dust-tt/sparkle";
import { useMemo, useRef, useState } from "react";

export type PersonalAuthResolutionOutcome = "completed" | "denied";

interface PersonalAuthenticationCardProps {
  triggeringUser: UserType | null;
  // The viewer looking at the card. Passed in rather than read from `AuthContext` because shared
  // frames render this card outside of any AuthProvider.
  currentUser: UserType;
  mcpServerId: string;
  owner: LightWorkspaceType;
  provider: OAuthProvider;
  scope?: string;
  isResolving: boolean;
  // Submits the resolution outcome; returns whether the submission succeeded.
  onResolve: (outcome: PersonalAuthResolutionOutcome) => Promise<boolean>;
}

export function PersonalAuthenticationCard({
  triggeringUser,
  currentUser,
  mcpServerId,
  owner,
  provider,
  scope,
  isResolving,
  onResolve,
}: PersonalAuthenticationCardProps) {
  const { server: mcpServer } = useMCPServer({
    owner,
    serverId: mcpServerId,
  });

  const { createPersonalConnection } = useCreatePersonalConnection(owner);

  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [overriddenCredentials, setCredentialOverrides] = useState<
    Record<string, string>
  >({});

  // Tracks whether the user declined this action while a connection
  // attempt is still in flight, so the post-await "completed" branch does not
  // resolve an action that has already been denied.
  const cancelledRef = useRef<boolean>(false);

  const overridableInputs = getOverridablePersonalAuthInputs({ provider });

  const icon = mcpServer?.icon ? getIcon(mcpServer.icon) : Key01;

  const serverDisplayName =
    mcpServer && mcpServer.name
      ? getMcpServerDisplayName(mcpServer)
      : undefined;

  const canCurrentUserRespond = useMemo(
    () =>
      canCurrentUserRespondToParentUserMessage({
        parentUserId: triggeringUser?.sId,
        currentUserId: currentUser.sId,
      }),
    [triggeringUser, currentUser.sId]
  );

  const onConnectClick = async (mcpServer: MCPServerType) => {
    cancelledRef.current = false;
    setIsConnecting(true);
    setConnectionError(null);

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
      if (result.error) {
        setConnectionError(result.error);
      }
      return;
    }

    // The user declined while the connection attempt was still in flight: the
    // action was already denied, so do not resolve it as completed.
    if (cancelledRef.current) {
      return;
    }

    const completed = await onResolve("completed");

    if (!completed) {
      return;
    }
  };

  const onDeclineClick = async () => {
    // Signal any in-flight connection attempt to abandon its completed branch.
    cancelledRef.current = true;
    setConnectionError(null);

    await onResolve("denied");
  };

  return (
    <Card
      variant="secondary"
      containerClassName="w-full max-w-xl"
      className="flex-col p-0 shadow"
    >
      <div className="flex items-center gap-3 px-5 pt-4">
        <Avatar icon={icon} size="sm" />
        <div className="heading-base min-w-0">Connect account</div>
      </div>

      <div className="flex flex-col gap-4 wrap-break-word px-5 py-4">
        <div className="text-base text-muted-foreground">
          {`Dust needs access to ${serverDisplayName ?? "this service"} to complete this action.`}
        </div>
        <div className="text-base text-muted-foreground">
          {`Once connected, ${serverDisplayName ?? "this service"} will remain connected for future requests.`}
        </div>
        {canCurrentUserRespond ? (
          <>
            {overridableInputs && mcpServer && (
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
            )}
            {connectionError && (
              <div className="text-sm font-medium text-warning-800">
                {connectionError}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            Waiting for{" "}
            <span className="font-semibold text-foreground">
              {triggeringUser?.fullName}
            </span>{" "}
            to connect their account.
          </div>
        )}
      </div>

      {canCurrentUserRespond && mcpServer && (
        <div className="flex justify-end gap-2 px-4 pb-3 pt-2">
          <Button
            variant="outline"
            label="Decline"
            icon={XClose}
            // Not gated on `isConnecting`: the user must always be able to abandon
            // a connection attempt, even if it is (or appears) stuck.
            disabled={isResolving}
            onClick={() => void onDeclineClick()}
          />
          <Button
            variant="highlight"
            label={`Connect ${serverDisplayName ?? "account"}`}
            icon={Check}
            disabled={
              isConnecting ||
              isResolving ||
              !areCredentialOverridesValid(
                overridableInputs,
                overriddenCredentials
              )
            }
            isLoading={isConnecting}
            onClick={() => void onConnectClick(mcpServer)}
          />
        </div>
      )}
    </Card>
  );
}
