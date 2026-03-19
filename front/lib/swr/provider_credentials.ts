import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import { workspaceAuthContextUrl } from "@app/lib/swr/workspaces";
import type { GetProviderCredentialsResponseBody } from "@app/pages/api/w/[wId]/provider_credentials";
import type {
  ProviderCredentialBody,
  ProviderCredentialResponseBody,
} from "@app/pages/api/w/[wId]/provider_credentials/[providerId]";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import type { ProviderCredentialType } from "@app/types/provider_credential";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

const baseProviderCredentialsApiUrl = (workspaceId: string) =>
  `/api/w/${workspaceId}/provider_credentials`;

const providerCredentialApiUrl = (
  workspaceId: string,
  providerId: ByokModelProviderIdType
) => `${baseProviderCredentialsApiUrl(workspaceId)}/${providerId}`;

export function useProviderCredentials({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const providerCredentialsFetcher: Fetcher<GetProviderCredentialsResponseBody> =
    fetcher;

  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    baseProviderCredentialsApiUrl(owner.sId),
    providerCredentialsFetcher
  );

  return {
    providerCredentials:
      data?.providerCredentials ?? emptyArray<ProviderCredentialType>(),
    isProviderCredentialsLoading: isLoading,
    isProviderCredentialsError: !!error,
    mutateProviderCredentials: mutate,
  };
}

export function useSaveProviderCredential({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();
  const [isSaving, setIsSaving] = useState(false);

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
      setIsSaving(true);
      try {
        const url = providerCredentialApiUrl(owner.sId, providerId);
        const response = await clientFetch(url, {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey } satisfies ProviderCredentialBody),
        });

        if (!response.ok) {
          const error = await getErrorFromResponse(response);
          sendNotification({
            type: "error",
            title: "Failed to save API key",
            description: error.message,
          });
          return null;
        }

        const data: ProviderCredentialResponseBody = await response.json();

        sendNotification({
          type: "success",
          title: "API key saved",
          description: "Your API key has been configured successfully.",
        });

        await mutate(baseProviderCredentialsApiUrl(owner.sId));
        await mutate(workspaceAuthContextUrl(owner.sId));

        return data.providerCredential;
      } catch (e) {
        const message = normalizeError(e).message;
        sendNotification({
          type: "error",
          title: "Failed to save API key",
          description: message,
        });
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [owner.sId, sendNotification, mutate]
  );

  return { saveProviderCredential, isSaving };
}

export function useDeleteProviderCredential({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteProviderCredential = useCallback(
    async ({
      providerId,
    }: {
      providerId: ByokModelProviderIdType;
    }): Promise<boolean> => {
      setIsDeleting(true);
      try {
        const response = await clientFetch(
          providerCredentialApiUrl(owner.sId, providerId),
          { method: "DELETE" }
        );

        if (!response.ok) {
          const error = await getErrorFromResponse(response);
          sendNotification({
            type: "error",
            title: "Failed to remove API key",
            description: error.message,
          });
          return false;
        }

        sendNotification({
          type: "success",
          title: "API key removed",
          description: "The API key has been removed successfully.",
        });

        await mutate(baseProviderCredentialsApiUrl(owner.sId));
        await mutate(workspaceAuthContextUrl(owner.sId));
        return true;
      } catch (e) {
        const message = normalizeError(e).message;
        sendNotification({
          type: "error",
          title: "Failed to remove API key",
          description: message,
        });
        return false;
      } finally {
        setIsDeleting(false);
      }
    },
    [owner.sId, sendNotification, mutate]
  );

  return { deleteProviderCredential, isDeleting };
}
