import { useSendNotification } from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import {
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  DeletePlatformActionsConfigurationBodySchemaType,
  GetPlatformActionsConfigurationResponseBody,
  PostPlatformActionsConfigurationBodySchemaType,
  PostPlatformActionsConfigurationResponseBody,
} from "@app/pages/api/w/[wId]/platform_actions/configurations";

export function usePlatformActionsConfigurations({
  disabled,
  owner,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
}) {
  const configurationsFetcher: Fetcher<GetPlatformActionsConfigurationResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/platform_actions/configurations`,
    configurationsFetcher,
    {
      disabled,
    }
  );

  return {
    configurations: useMemo(() => (data ? data.configurations : []), [data]),
    isConfigurationsLoading: !error && !data,
    isConfigurationsError: !!error,
    mutateConfigurations: mutate,
  };
}

export function useCreatePlatformActionsConfigurations({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { mutateConfigurations } = usePlatformActionsConfigurations({
    owner,
    disabled: true,
  });
  const sendNotification = useSendNotification();

  const doCreate = async (
    body: PostPlatformActionsConfigurationBodySchemaType
  ) => {
    const upsertUrl = `/api/w/${owner.sId}/platform_actions/configurations`;
    const res = await fetch(upsertUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Failed to create configuration.",
        description: `${errorData.message}`,
      });
      return null;
    } else {
      void mutateConfigurations();

      sendNotification({
        type: "success",
        title: "Configuration successfully created",
        description: "The platform actions were successfully configured.",
      });

      const response: PostPlatformActionsConfigurationResponseBody =
        await res.json();
      return response.configuration;
    }
  };

  return doCreate;
}

export function useDeletePlatformActionsConfigurations({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { mutateConfigurations } = usePlatformActionsConfigurations({
    owner,
    disabled: true,
  });
  const sendNotification = useSendNotification();

  const doDelete = async (
    body: DeletePlatformActionsConfigurationBodySchemaType
  ) => {
    const upsertUrl = `/api/w/${owner.sId}/platform_actions/configurations`;
    const res = await fetch(upsertUrl, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Failed to delete configuration.",
        description: `${errorData.message}`,
      });
      return null;
    } else {
      void mutateConfigurations();

      sendNotification({
        type: "success",
        title: "Configuration successfully deleted",
        description:
          "The platform actions configuration was successfully deleted.",
      });
      return null;
    }
  };

  return doDelete;
}
