// LABS - CAN BE REMOVED ANYTIME

import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";
import type { PatchTranscriptsConfiguration } from "@app/pages/api/w/[wId]/labs/transcripts/[tId]";
import type {
  LabsTranscriptsConfigurationType,
  LightWorkspaceType,
  Result,
} from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

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
  owner,
  transcriptsConfiguration,
}: {
  owner: LightWorkspaceType;
  transcriptsConfiguration: LabsTranscriptsConfigurationType;
}) {
  const sendNotification = useSendNotification();
  const doUpdate = async (
    data: Partial<PatchTranscriptsConfiguration>
  ): Promise<Result<undefined, Error>> => {
    const response = await fetch(
      `/api/w/${owner.sId}/labs/transcripts/${transcriptsConfiguration.sId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );
    if (!response.ok) {
      const error = await response.json();
      sendNotification({
        type: "error",
        title: "Failed to update transcript configuration",
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        description: error.error?.message || "Unknown error",
      });
      return new Err(normalizeError(error));
    }
    sendNotification({
      type: "success",
      title: "Success!",
      description:
        // Check if we're updating processing (isActive field)
        data.isActive !== undefined
          ? data.isActive
            ? "We will now process your meeting transcripts."
            : "We will no longer process your meeting transcripts."
          : // Check if we're updating storage (dataSourceViewId field)
            data.dataSourceViewId
            ? "We will now store your meeting transcripts."
            : "We will no longer store your meeting transcripts.",
    });
    return new Ok(undefined);
  };
  return { doUpdate };
}
