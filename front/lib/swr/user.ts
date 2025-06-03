import { useSendNotification } from "@dust-tt/sparkle";
import type { Fetcher } from "swr";

import {
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetUserResponseBody } from "@app/pages/api/user";
import type { GetUserMetadataResponseBody } from "@app/pages/api/user/metadata/[key]";
import type { JobType } from "@app/types/job_type";

export function useUser() {
  const userFetcher: Fetcher<GetUserResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults("/api/user", userFetcher);

  return {
    user: data ? data.user : null,
    isUserLoading: !error && !data,
    isUserError: error,
    mutateUser: mutate,
  };
}

export function useUserMetadata(key: string) {
  const userMetadataFetcher: Fetcher<GetUserMetadataResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/user/metadata/${encodeURIComponent(key)}`,
    userMetadataFetcher
  );

  return {
    metadata: data ? data.metadata : null,
    isMetadataLoading: !error && !data,
    isMetadataError: error,
    mutateMetadata: mutate,
  };
}

export function useDeleteMetadata(prefix: string) {
  const deleteMetadata = async (spec?: string) => {
    const fullKey = spec ? `${prefix}:${spec}` : prefix;
    await fetch(`/api/user/metadata/${encodeURIComponent(fullKey)}`, {
      method: "DELETE",
    });
  };

  return { deleteMetadata };
}

export function usePatchUser() {
  const { mutateUser } = useUser();
  const sendNotification = useSendNotification();

  const patchUser = async (
    firstName: string,
    lastName: string,
    notifySuccess: boolean,
    jobType?: JobType
  ) => {
    const res = await fetch("/api/user", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        firstName,
        lastName,
        jobType,
      }),
    });

    if (res.ok) {
      if (notifySuccess) {
        sendNotification({
          type: "success",
          title: "Updated User",
          description: `Successfully updated your profile.`,
        });
      }

      await mutateUser();

      return res.json();
    } else {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Error Updating User",
        description: `Error: ${errorData.message}`,
      });

      return null;
    }
  };

  return { patchUser };
}
