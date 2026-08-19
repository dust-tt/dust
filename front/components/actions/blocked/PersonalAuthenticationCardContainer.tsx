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
import {
  Key01,
  PersonalAuthenticationCard as PersonalAuthenticationCardView,
} from "@dust-tt/sparkle";
import { useRef, useState } from "react";

export type PersonalAuthResolutionOutcome = "completed" | "denied";

interface PersonalAuthenticationCardContainerProps {
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

export function PersonalAuthenticationCardContainer({
  triggeringUser,
  currentUser,
  mcpServerId,
  owner,
  provider,
  scope,
  isResolving,
  onResolve,
}: PersonalAuthenticationCardContainerProps) {
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

  const canCurrentUserRespond = canCurrentUserRespondToParentUserMessage({
    parentUserId: triggeringUser?.sId,
    currentUserId: currentUser.sId,
  });

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

  const credentialInputs =
    canCurrentUserRespond && overridableInputs && mcpServer ? (
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
    ) : undefined;

  return (
    <PersonalAuthenticationCardView
      icon={icon}
      serviceName={serverDisplayName}
      canRespond={canCurrentUserRespond}
      triggeringUserName={triggeringUser?.fullName}
      credentialInputs={credentialInputs}
      errorMessage={connectionError}
      isConnecting={isConnecting}
      isResolving={isResolving}
      connectDisabled={
        !areCredentialOverridesValid(overridableInputs, overriddenCredentials)
      }
      onDecline={
        canCurrentUserRespond && mcpServer
          ? () => void onDeclineClick()
          : undefined
      }
      onConnect={
        canCurrentUserRespond && mcpServer
          ? () => void onConnectClick(mcpServer)
          : undefined
      }
    />
  );
}
