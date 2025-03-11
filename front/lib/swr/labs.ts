// LABS - CAN BE REMOVED ANYTIME

import type { WorkspaceType } from "@dust-tt/types";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";

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
  owner: WorkspaceType;
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
  owner: WorkspaceType;
  provider: string;
}) {
  const isConnectorConnectedFetcher: Fetcher<boolean> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/labs/transcripts/connector?provider=${provider}`,
    isConnectorConnectedFetcher
  );

  return {
    isConnectorConnected: data ?? false,
    isConnectorConnectedLoading: !error && !data,
    isConnectorConnectedError: error,
    mutateIsConnectorConnected: mutate,
  };
}
