import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type {
  PostProviderCredentialBody,
  PostProviderCredentialResponseBody,
} from "@app/pages/api/w/[wId]/provider_credentials";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import type { ProviderCredentialType } from "@app/types/provider_credential";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

export function useCreateProviderCredential({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  const createProviderCredential = useCallback(
    async ({
      providerId,
      apiKey,
    }: {
      providerId: ByokModelProviderIdType;
      apiKey: string;
    }): Promise<ProviderCredentialType | null> => {
      const response = await clientFetch(
        `/api/w/${owner.sId}/provider_credentials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId,
            apiKey,
          } satisfies PostProviderCredentialBody),
        }
      );

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        sendNotification({
          type: "error",
          title: "Failed to save API key",
          description: error.message,
        });
        return null;
      }

      const data: PostProviderCredentialResponseBody = await response.json();

      sendNotification({
        type: "success",
        title: "API key saved",
        description: "Your API key has been configured successfully.",
      });

      return data.providerCredential;
    },
    [owner.sId, sendNotification]
  );

  return { createProviderCredential };
}
