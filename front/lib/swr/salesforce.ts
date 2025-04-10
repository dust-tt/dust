import { useSendNotification } from "@dust-tt/sparkle";
import { useMemo } from "react";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { DataSourceType, LightWorkspaceType } from "@app/types";

export type SalesforceDataSourceWithPersonalConnection = DataSourceType & {
  personalConnection: string | null;
};

export function useSalesforceDataSourcesWithPersonalConnection({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}): {
  dataSources: SalesforceDataSourceWithPersonalConnection[];
  isLoading: boolean;
  isError: boolean;
  mutate: () => Promise<void>;
} {
  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    `/api/w/${owner.sId}/labs/salesforce_personal_connections`,
    fetcher,
    { disabled }
  );

  return {
    dataSources: useMemo(() => (data ? data.dataSources : []), [data]),
    isLoading,
    isError: error,
    mutate,
  };
}

export function useCreateSalesforcePersonalConnection(
  owner: LightWorkspaceType
) {
  const { mutate } = useSalesforceDataSourcesWithPersonalConnection({
    disabled: true,
    owner,
  });
  const sendNotification = useSendNotification();

  const createPersonalConnection = async (
    dataSource: DataSourceType,
    connectionId: string
  ): Promise<void> => {
    try {
      const response = await fetch(
        `/api/w/${owner.sId}/labs/salesforce_personal_connections/${dataSource.sId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.api_error?.message || "Failed to synchronize server"
        );
      }

      void mutate();
      if (!response.ok) {
        sendNotification({
          type: "error",
          title: "Failed to connect provider",
          description: "Could not connect to your account. Please try again.",
        });
      } else {
        sendNotification({
          type: "success",
          title: "Provider connected",
          description: "Your account has been connected successfully.",
        });
        await mutate();
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect provider",
        description:
          "Unexpected error trying to connect to your provider. Please try again. Error: " +
          error,
      });
    }
  };

  return { createPersonalConnection };
}

export function useDeleteSalesforcePersonalConnection(
  owner: LightWorkspaceType
) {
  const { mutate } = useSalesforceDataSourcesWithPersonalConnection({
    disabled: true,
    owner,
  });
  const sendNotification = useSendNotification();

  const deletePersonalConnection = async (
    dataSource: DataSourceType
  ): Promise<void> => {
    try {
      const response = await fetch(
        `/api/w/${owner.sId}/labs/salesforce_personal_connections/${dataSource.sId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        sendNotification({
          type: "error",
          title: "Failed to disconnect provider",
          description:
            "Cannot disconnect from your provider. Please try again.",
        });
      } else {
        sendNotification({
          type: "success",
          title: "Provider disconnected",
          description: "Your provider has been disconnected successfully.",
        });
        await mutate();
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect provider",
        description:
          "Unexpected error trying to disconnect to your provider. Please try again. Error: " +
          error,
      });
    }
  };

  return { deletePersonalConnection };
}
