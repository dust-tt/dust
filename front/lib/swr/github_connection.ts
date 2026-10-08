import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { useCellContext } from "@app/lib/auth/CellContext";
import type { GetGitHubConnectionResponseBody } from "@app/lib/skill_detection";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { setupOAuthConnection } from "@app/types/oauth/client/setup";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
        title: t`GitHub disconnected`,
      });
      return true;
    } catch (err) {
      sendApiErrorNotification({
        title: t`Failed to disconnect GitHub`,
        error: err,
      });
      return false;
    } finally {
      setIsDisconnectingGitHub(false);
    }
  }, [fetcher, owner, sendNotification, sendApiErrorNotification, t]);

  return { disconnectGitHub, isDisconnectingGitHub };
}

export function useConnectWorkspaceGitHub({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
        sendApiErrorNotification({
          title: t`Failed to connect GitHub`,
          error: connectionResult.error,
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
        sendApiErrorNotification({
          title: t`Failed to connect GitHub`,
          error: err,
        });
        return false;
      }

      sendNotification({
        type: "success",
        title: t`GitHub connected`,
        description: t`All workspace members will share this connection.`,
      });
      return true;
    } finally {
      setIsConnectingGitHub(false);
    }
  }, [fetcher, owner, cellInfo, sendNotification, sendApiErrorNotification, t]);

  return { connectGitHub, isConnectingGitHub };
}
