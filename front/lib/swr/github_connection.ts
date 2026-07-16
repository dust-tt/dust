import { useSendNotification } from "@app/hooks/useNotification";
import { useRegionContext } from "@app/lib/auth/RegionContext";
import { useFetcher } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
import { setupOAuthConnection } from "@app/types/oauth/client/setup";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

export function useConnectWorkspaceGitHub({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const { regionInfo } = useRegionContext();
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
        regionInfo,
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
        await fetcher(`/api/w/${owner.sId}/skills/github-connection`, {
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
  }, [fetcher, owner, regionInfo, sendNotification]);

  return { connectGitHub, isConnectingGitHub };
}
