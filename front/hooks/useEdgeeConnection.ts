import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  EdgeeConnectionBody,
  EdgeeConnectionType,
  GetEdgeeConnectionResponseBody,
  PutEdgeeConnectionResponseBody,
} from "@app/types/gateways/edgee";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

const edgeeConnectionApiUrl = (workspaceId: string) =>
  `/api/w/${workspaceId}/edgee_connection`;

type UseEdgeeConnectionParams = {
  owner: LightWorkspaceType;
};

export function useEdgeeConnection({ owner }: UseEdgeeConnectionParams) {
  const { fetcher } = useFetcher();
  const edgeeConnectionFetcher: Fetcher<GetEdgeeConnectionResponseBody> =
    fetcher;

  const { data, error, isLoading } = useSWRWithDefaults(
    edgeeConnectionApiUrl(owner.sId),
    edgeeConnectionFetcher
  );

  return {
    edgeeConnection: data?.connection ?? null,
    isEdgeeConnectionLoading: isLoading,
    isEdgeeConnectionError: !!error,
  };
}

export function useSaveEdgeeConnection({ owner }: UseEdgeeConnectionParams) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();
  const [isSaving, setIsSaving] = useState(false);

  const saveEdgeeConnection = useCallback(
    async (body: EdgeeConnectionBody): Promise<EdgeeConnectionType | null> => {
      setIsSaving(true);
      try {
        const response = await clientFetch(edgeeConnectionApiUrl(owner.sId), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const error = await getErrorFromResponse(response);
          sendApiErrorNotification({
            title: t`Failed to save the Edgee connection`,
            error,
          });
          return null;
        }

        const data: PutEdgeeConnectionResponseBody = await response.json();
        sendNotification({
          type: "success",
          title: t`Edgee connection saved`,
          description: t`Model calls now go through your Edgee organization.`,
        });
        await mutate(edgeeConnectionApiUrl(owner.sId));

        return data.connection;
      } catch (e) {
        sendNotification({
          type: "error",
          title: t`Failed to save the Edgee connection`,
          description: normalizeError(e).message,
        });
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [owner.sId, mutate, sendApiErrorNotification, sendNotification, t]
  );

  return { saveEdgeeConnection, isSaving };
}
