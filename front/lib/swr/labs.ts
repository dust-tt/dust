// LABS - CAN BE REMOVED ANYTIME

import { useSendNotification } from "@dust-tt/sparkle";
import type { Fetcher } from "swr";

import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";
import type { PatchTranscriptsConfiguration } from "@app/pages/api/w/[wId]/labs/transcripts/[tId]";
import type { LightWorkspaceType, ModelId } from "@app/types";

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
      credentialId: string | null;
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
    credentialId,
    connectionId,
  }: {
    provider: string;
    credentialId?: string;
    connectionId?: string;
  }) => {
    const res = await fetch(`/api/w/${workspaceId}/labs/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider,
        ...(credentialId ? { credentialId } : {}),
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
