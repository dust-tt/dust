// LABS - CAN BE REMOVED ANYTIME

import type { WorkspaceType } from "@dust-tt/types";
import type { Fetcher } from "swr";

import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
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

export function useGetDefaultConfiguration({
  owner,
}: {
  owner: WorkspaceType;
}) {
  const getDefaultConfiguration = async (provider: string) => {
    const response = await fetch(
      `/api/w/${owner.sId}/labs/transcripts/default?provider=${provider}`
    );

    if (response.ok) {
      const defaultConfigurationRes = await response.json();
      const defaultConfiguration: LabsTranscriptsConfigurationResource =
        defaultConfigurationRes.configuration;

      return defaultConfiguration;
    }

    return null;
  };

  return getDefaultConfiguration;
}
