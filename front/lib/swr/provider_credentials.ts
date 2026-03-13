import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetProviderCredentialsResponseBody,
  PostProviderCredentialBody,
  PostProviderCredentialResponseBody,
} from "@app/pages/api/w/[wId]/provider_credentials";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import type { ProviderCredentialType } from "@app/types/provider_credential";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function useProviderCredentials({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const providerCredentialsFetcher: Fetcher<GetProviderCredentialsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/provider_credentials`,
    providerCredentialsFetcher
  );

  return {
    providerCredentials:
      data?.providerCredentials ?? emptyArray<ProviderCredentialType>(),
    isProviderCredentialsLoading: !error && !data,
    isProviderCredentialsError: !!error,
    mutateProviderCredentials: mutate,
  };
}

export function useProviderCredentialActions({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  const saveProviderCredential = useCallback(
    async ({
      providerId,
      apiKey,
      isNew = true,
    }: {
      providerId: ByokModelProviderIdType;
      apiKey: string;
      isNew?: boolean;
    }): Promise<ProviderCredentialType | null> => {
      const response = await clientFetch(
        `/api/w/${owner.sId}/provider_credentials`,
        {
          method: isNew ? "POST" : "PATCH",
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

  return { saveProviderCredential };
}
