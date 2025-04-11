// LABS - CAN BE REMOVED ANYTIME

import { useSendNotification } from "@dust-tt/sparkle";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { getPKCEConfig } from "@app/lib/utils/pkce";
import type { GetLabsConnectionsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/connections";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";
import type { PatchTranscriptsConfiguration } from "@app/pages/api/w/[wId]/labs/transcripts/[tId]";
import type { DataSourceType } from "@app/types";
import type { LightWorkspaceType, ModelId } from "@app/types";
import { isOAuthProvider, setupOAuthConnection } from "@app/types";

// Transcripts
export function useLabsTranscriptsConfiguration({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const transcriptsConfigurationFetcher: Fetcher<GetLabsTranscriptsConfigurationResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/labs/transcripts`,
    transcriptsConfigurationFetcher
  );

  return {
    transcriptsConfiguration: data ? data.configuration : null,
    isTranscriptsConfigurationLoading: !error && !data,
    isTranscriptsConfigurationError: error,
    mutateTranscriptsConfiguration: mutate,
  };
}

export function useLabsTranscriptsDefaultConfiguration({
  owner,
  provider,
}: {
  owner: LightWorkspaceType;
  provider: string;
}) {
  const defaultConfigurationFetcher: Fetcher<GetLabsTranscriptsConfigurationResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/labs/transcripts/default?provider=${provider}`,
    defaultConfigurationFetcher
  );

  return {
    defaultConfiguration: data ? data.configuration : null,
    isDefaultConfigurationLoading: !error && !data,
    isDefaultConfigurationError: error,
    mutateDefaultConfiguration: mutate,
  };
}

export function useLabsTranscriptsIsConnectorConnected({
  owner,
  provider,
}: {
  owner: LightWorkspaceType;
  provider: string;
}) {
  const isConnectorConnectedFetcher: Fetcher<{
    isConnected: boolean;
    dataSource: DataSourceResource | null;
  }> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/labs/transcripts/connector?provider=${provider}`,
    isConnectorConnectedFetcher
  );

  return {
    isConnectorConnected: data?.isConnected ?? false,
    dataSource: data?.dataSource ?? null,
    isConnectorConnectedLoading: !error && !data,
    isConnectorConnectedError: error,
    mutateIsConnectorConnected: mutate,
  };
}

export function useUpdateTranscriptsConfiguration({
  workspaceId,
  transcriptConfigurationId,
}: {
  workspaceId: string;
  transcriptConfigurationId: number;
}) {
  return async (data: Partial<PatchTranscriptsConfiguration>) => {
    const response = await fetch(
      `/api/w/${workspaceId}/labs/transcripts/${transcriptConfigurationId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    return response.ok;
  };
}

export type SalesforceDataSourceWithPersonalConnection = DataSourceType & {
  personalConnection: string | null;
};

export function useLabsSalesforceDataSourcesWithPersonalConnection({
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

export function useLabsCreateSalesforcePersonalConnection(
  owner: LightWorkspaceType
) {
  const { mutate } = useLabsSalesforceDataSourcesWithPersonalConnection({
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

export function useLabsDeleteSalesforcePersonalConnection(
  owner: LightWorkspaceType
) {
  const { mutate } = useLabsSalesforceDataSourcesWithPersonalConnection({
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

export function useUpdateLabsConnectionConfiguration({
  workspaceId,
  connectionId,
}: {
  workspaceId: string;
  connectionId: string;
}) {
  return async (
    data: Partial<{
      dataSourceViewId: ModelId | null;
      apiKey: string | null;
      connectionId: string | null;
    }>
  ) => {
    const response = await fetch(
      `/api/w/${workspaceId}/labs/connections/${connectionId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    return response.ok;
  };
}

export function useCreateLabsConnectionConfiguration({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const createConnectionConfiguration = async ({
    provider,
    apiKey,
    connectionId,
  }: {
    provider: string;
    apiKey?: string;
    connectionId?: string;
  }) => {
    const res = await fetch(`/api/w/${workspaceId}/labs/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider,
        ...(apiKey ? { apiKey } : {}),
        ...(connectionId ? { connectionId } : {}),
      }),
    });

    if (!res.ok) {
      const error = await res.json();
      sendNotification({
        type: "error",
        title: "Failed to create connection",
        description: error.error.message,
      });
      return false;
    }

    sendNotification({
      type: "success",
      title: "Success!",
      description: "Connection created successfully.",
    });
    return true;
  };

  return createConnectionConfiguration;
}

export function useLabsConnectionConfiguration({
  workspaceId,
  connectionId,
}: {
  workspaceId: string;
  connectionId: string;
}) {
  const configurationFetcher: Fetcher<GetLabsConnectionsConfigurationResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/labs/connections/${connectionId}`,
    configurationFetcher
  );

  return {
    configuration: data ? data : null,
    isConfigurationLoading: !error && !data,
    isConfigurationError: error,
    mutateConfiguration: mutate,
  };
}

export function useDeleteLabsConnectionConfiguration({
  workspaceId,
  connectionId,
}: {
  workspaceId: string;
  connectionId: string;
}) {
  const sendNotification = useSendNotification();

  const deleteConnectionConfiguration = async () => {
    const res = await fetch(
      `/api/w/${workspaceId}/labs/connections/${connectionId}`,
      {
        method: "DELETE",
      }
    );

    if (!res.ok) {
      const error = await res.json();
      sendNotification({
        type: "error",
        title: "Failed to disconnect",
        description: error.error.message,
      });
      return false;
    }

    sendNotification({
      type: "success",
      title: "Success!",
      description: "Connection disconnected successfully.",
    });
    return true;
  };

  return deleteConnectionConfiguration;
}

export function useLabsConnectionConfigurations({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const configurationsFetcher: Fetcher<LabsConnectionsConfigurationResource[]> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/labs/connections`,
    configurationsFetcher
  );

  return {
    configurations: data || [],
    isConfigurationsLoading: !error && !data,
    isConfigurationsError: error,
    mutateConfigurations: mutate,
  };
}
