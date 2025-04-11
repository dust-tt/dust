import { useSendNotification } from "@dust-tt/sparkle";
import { useMemo } from "react";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { getPKCEConfig } from "@app/lib/utils/pkce";
import type { DataSourceType, LightWorkspaceType } from "@app/types";
import { isOAuthProvider, setupOAuthConnection } from "@app/types";

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
    dataSource: DataSourceType
  ): Promise<void> => {
    try {
      const provider = dataSource.connectorProvider;
      const { code_verifier, code_challenge } = await getPKCEConfig();
      if (isOAuthProvider(provider)) {
        const cRes = await setupOAuthConnection({
          dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
          owner,
          provider,
          useCase: "salesforce_personal",
          extraConfig: {
            code_verifier,
            code_challenge,
          },
        });

        if (cRes.isErr()) {
          sendNotification({
            type: "error",
            title: "Failed to connect provider",
            description: cRes.error.message,
          });
          return;
        }

        const response = await fetch(
          `/api/w/${owner.sId}/labs/salesforce_personal_connections/${dataSource.sId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ connectionId: cRes.value.connection_id }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(
            error.api_error?.message || "Failed to synchronize server"
          );
        }

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
      } else {
        sendNotification({
          type: "error",
          title: "Failed to connect provider",
          description: "Unknown provider",
        });
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
