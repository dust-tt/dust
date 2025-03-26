import { useSendNotification } from "@dust-tt/sparkle";
import { useCallback } from "react";

import type {
  AuthorizationInfo,
  InternalMCPServerId,
} from "@app/lib/actions/mcp_internal_actions";
import {
  useCreateMCPServerConnection,
  useDeleteMCPServerConnection,
} from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";
import { OAUTH_PROVIDER_NAMES, setupOAuthConnection } from "@app/types";

export const useMCPConnectionManagement = ({
  owner,
}: {
  owner: LightWorkspaceType;
}) => {
  const { createMCPServerConnection } = useCreateMCPServerConnection({ owner });
  const { deleteMCPServerConnection } = useDeleteMCPServerConnection({ owner });
  const sendNotification = useSendNotification();

  const createAndSaveMCPServerConnection = useCallback(
    async ({
      authorizationInfo,
      serverId,
    }: {
      authorizationInfo: AuthorizationInfo;
      serverId: InternalMCPServerId;
    }) => {
      const cRes = await setupOAuthConnection({
        dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
        owner,
        provider: authorizationInfo.provider,
        useCase: authorizationInfo.use_case,
        extraConfig: {},
      });

      if (cRes.isErr()) {
        sendNotification({
          type: "error",
          title: `Failed to connect ${OAUTH_PROVIDER_NAMES[authorizationInfo.provider]}`,
          description: cRes.error.message,
        });
        return;
      }
      return createMCPServerConnection({
        connectionId: cRes.value.connection_id,
        internalMCPServerId: serverId,
      });
    },
    [owner, sendNotification, createMCPServerConnection]
  );

  return { createAndSaveMCPServerConnection, deleteMCPServerConnection };
};
