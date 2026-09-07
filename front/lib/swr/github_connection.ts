import { useSendNotification } from "@app/hooks/useNotification";
import { useCellContext } from "@app/lib/auth/CellContext";
import type { GetGitHubConnectionResponseBody } from "@app/lib/skill_detection";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
import { setupOAuthConnection } from "@app/types/oauth/client/setup";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";
import type { Fetcher } from "swr";

export function useWorkspaceGitHubConnection({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const connectionFetcher: Fetcher<GetGitHubConnectionResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/skills/import/github-connection`,
    connectionFetcher,
    { disabled }
  );

  return {
    connection: data?.connection ?? null,
    isConnectionLoading: !error && !data && !disabled,
    isConnectionError: error,
    mutateConnection: mutate,
  };
}

export function useDisconnectWorkspaceGitHub({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();
  const [isDisconnectingGitHub, setIsDisconnectingGitHub] = useState(false);

  const disconnectGitHub = useCallback(async (): Promise<boolean> => {
    setIsDisconnectingGitHub(true);
    try {
      await fetcher(`/api/w/${owner.sId}/skills/import/github-connection`, {
        method: "DELETE",
      });
      sendNotification({
        type: "success",
        title: "GitHub disconnected",
      });
      return true;
    } catch (err) {
      sendNotification({
        type: "error",
        title: "Failed to disconnect GitHub",
        description: isAPIErrorResponse(err)
          ? err.error.message
          : "Could not disconnect the GitHub connection.",
      });
      return false;
    } finally {
      setIsDisconnectingGitHub(false);
    }
  }, [fetcher, owner, sendNotification]);

  return { disconnectGitHub, isDisconnectingGitHub };
}

export function useConnectWorkspaceGitHub({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const { cellInfo } = useCellContext();
  const sendNotification = useSendNotification();
  const [isConnectingGitHub, setIsConnectingGitHub] = useState(false);

  const connectGitHub = useCallback(async (): Promise<boolean> => {
    setIsConnectingGitHub(true);
    try {
      const connectionResult = await setupOAuthConnection({
        owner,
        provider: "github",
        useCase: "platform_actions",
        extraConfig: {},
        cellInfo,
      });
      if (connectionResult.isErr()) {
        sendNotification({
          type: "error",
          title: "Failed to connect GitHub",
          description: connectionResult.error.message,
        });
        return false;
      }

      try {
        await fetcher(`/api/w/${owner.sId}/skills/import/github-connection`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId: connectionResult.value.connection_id,
          }),
        });
      } catch (err) {
        sendNotification({
          type: "error",
          title: "Failed to connect GitHub",
          description: isAPIErrorResponse(err)
            ? err.error.message
            : "Could not save the GitHub connection.",
        });
        return false;
      }

      sendNotification({
        type: "success",
        title: "GitHub connected",
        description: "All workspace members will share this connection.",
      });
      return true;
    } finally {
      setIsConnectingGitHub(false);
    }
  }, [fetcher, owner, cellInfo, sendNotification]);

  return { connectGitHub, isConnectingGitHub };
}
