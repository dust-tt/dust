import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetTopLevelAppsResponseBody,
  PostTopLevelAppResponseBody,
  TopLevelAppType,
} from "@app/types/api/top_level_apps";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function useApps({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const appsFetcher: Fetcher<GetTopLevelAppsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/apps`,
    appsFetcher,
    { disabled }
  );

  return {
    apps: data?.apps ?? emptyArray<TopLevelAppType>(),
    isAppsLoading: !disabled && !error && !data,
    isAppsError: !!error,
    mutateApps: mutate,
  };
}

/**
 * Creates the App and returns it, so the caller can navigate to the builder and post the user's
 * first prompt into the conversation the App was created with.
 */
export function useCreateApp({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();
  const { mutateApps } = useApps({ owner, disabled: true });

  return useCallback(async (): Promise<TopLevelAppType | null> => {
    const res = await clientFetch(`/api/w/${owner.sId}/apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Error creating App",
        description: `Error: ${errorData.message}`,
      });
      return null;
    }

    const response: PostTopLevelAppResponseBody = await res.json();
    void mutateApps();

    return response.app;
  }, [owner.sId, sendNotification, mutateApps]);
}

/**
 * Deletes the App by hard-deleting the Pod behind it — same endpoint and `force` flag the Pod
 * Settings delete dialog uses, so the Pod's conversations, files, functions and databases go with
 * it. `useDeleteSpace` is not reused because it wants a full `SpaceType` and mutates the space
 * lists rather than the Apps list.
 */
export function useDeleteApp({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();
  const { mutateApps } = useApps({ owner, disabled: true });

  return useCallback(
    async (app: TopLevelAppType): Promise<boolean> => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${app.sId}?force=true`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: `Error deleting ${app.name}`,
          description: `Error: ${errorData.message}`,
        });
        return false;
      }

      void mutateApps();
      sendNotification({
        type: "success",
        title: `Successfully deleted ${app.name}`,
        description: `${app.name} was permanently deleted.`,
      });

      return true;
    },
    [owner.sId, sendNotification, mutateApps]
  );
}
